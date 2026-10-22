import prisma from '../../prisma/client';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { BomService } from './bom.service';
import { StockService } from '../stock.service';

export const productionBatchSchema = z.object({
  batchNumber: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantityPlanned: z.number().positive(),
    })
  ).min(1),
  notes: z.string().optional(),
});

export class ProductionService {
  /** Create a production batch, consume raw materials and add finished products */
  static async createBatch(payload: z.infer<typeof productionBatchSchema>, createdById: string) {
    const { batchNumber, items, notes } = payload;

    // Validate BOM feasibility for each product
    for (const it of items) {
      const bom = await BomService.getByProduct(it.productId);
      for (const bomItem of bom.items) {
        const requiredQty = bomItem.quantityRequired * it.quantityPlanned;
        if (bomItem.inventoryItem.currentStock < requiredQty) {
          throw new BadRequestError(
            `Insufficient stock for ${bomItem.inventoryItem.name}: need ${requiredQty}, have ${bomItem.inventoryItem.currentStock}`,
          );
        }
      }
    }

    // Create batch and perform stock updates atomically
    const batch = await prisma.$transaction(async (tx) => {
      const batch = await tx.productionBatch.create({
        data: {
          batchNumber,
          status: 'IN_PROGRESS',
          startDate: new Date(),
          createdById,
          notes,
        },
      });

      for (const it of items) {
        // Record planned production item
        await tx.productionItem.create({
          data: {
            productionBatchId: batch.id,
            productId: it.productId,
            quantityPlanned: it.quantityPlanned,
          },
        });

        // Consume raw materials according to BOM
        const bom = await BomService.getByProduct(it.productId);
        for (const bomItem of bom.items) {
          const qtyConsumed = bomItem.quantityRequired * it.quantityPlanned;
          // Update inventory stock (decrement)
          await tx.inventoryItem.update({
            where: { id: bomItem.inventoryItemId },
            data: { currentStock: { decrement: qtyConsumed } },
          });
          // Record usage movement
          await tx.productionUsage.create({
            data: {
              productionBatchId: batch.id,
              inventoryItemId: bomItem.inventoryItemId,
              quantityConsumed: qtyConsumed,
            },
          });
        }

        // Add finished product stock (increment)
        await tx.inventoryItem.update({
          where: { sku: it.productId }, // assuming finished product has SKU matching product ID; fallback create if missing
          data: { currentStock: { increment: it.quantityPlanned } },
        }).catch(async () => {
          // If finished product inventory entry does not exist, create it
          await tx.inventoryItem.create({
            data: {
              name: `Finished Product - ${it.productId}`,
              sku: it.productId,
              category: 'FINISHED_PRODUCT',
              unit: 'pcs',
              currentStock: it.quantityPlanned,
            },
          });
        });
      }

      // Mark batch as completed
      await tx.productionBatch.update({
        where: { id: batch.id },
        data: { status: 'COMPLETED', endDate: new Date() },
      });

      return batch;
    });

    return batch;
  }
}
