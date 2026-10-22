import prisma from '../../prisma/client';
import { z } from 'zod';
import { NotFoundError } from '../utils/errors';

export const bomItemSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantityRequired: z.number().positive(),
});

export const productBomSchema = z.object({
  productId: z.string().uuid(),
  items: z.array(bomItemSchema).min(1),
});

export class BomService {
  /** Create or replace BOM for a product */
  static async upsertBom(payload: z.infer<typeof productBomSchema>) {
    const { productId, items } = payload;
    // Ensure product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundError('Product not found');

    const bom = await prisma.productBOM.upsert({
      where: { productId },
      update: {},
      create: { productId },
    });

    // Remove existing BOM items then insert new ones (simpler than diffing)
    await prisma.bOMItem.deleteMany({ where: { bomId: bom.id } });
    const data = items.map((it) => ({
      bomId: bom.id,
      inventoryItemId: it.inventoryItemId,
      quantityRequired: it.quantityRequired,
    }));
    await prisma.bOMItem.createMany({ data });
    return bom;
  }

  static async getByProduct(productId: string) {
    const bom = await prisma.productBOM.findUnique({
      where: { productId },
      include: { items: { include: { inventoryItem: true } } },
    });
    if (!bom) throw new NotFoundError('BOM not found for product');
    return bom;
  }
}
