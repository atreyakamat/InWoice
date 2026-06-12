import prisma from '../config/db';

export class StockService {
  /**
   * Records a stock movement and updates the current stock of an inventory item.
   */
  static async recordMovement(
    inventoryItemId: string,
    type: 'PURCHASE' | 'PRODUCTION' | 'SALE' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGE' | 'TRANSFER',
    quantity: number, // Positive for additions, negative for deductions
    referenceType?: string,
    referenceId?: string,
    notes?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Create the movement record
      const movement = await tx.stockMovement.create({
        data: {
          inventoryItemId,
          type,
          quantity,
          referenceType,
          referenceId,
          notes
        }
      });

      // 2. Update current stock in InventoryItem
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: {
          currentStock: {
            increment: quantity
          }
        }
      });

      return movement;
    });
  }

  /**
   * Deducts stock for products sold in an invoice based on their BOM.
   */
  static async deductForInvoice(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true
      }
    });

    if (!invoice) throw new Error('Invoice not found');

    for (const item of invoice.items) {
      if (item.type === 'PRODUCT') {
        // Find if this product has a BOM
        const bom = await prisma.productBOM.findUnique({
          where: { productId: item.itemId },
          include: { items: true }
        });

        if (bom) {
          // Deduct raw materials based on BOM
          for (const bomItem of bom.items) {
            const totalToDeduct = bomItem.quantityRequired * item.quantity;
            await this.recordMovement(
              bomItem.inventoryItemId,
              'SALE',
              -totalToDeduct,
              'INVOICE',
              invoice.id,
              `Sold ${item.quantity} of ${item.name}`
            );
          }
        }
      }
      // Future: Handle Pack deductions similarly by iterating pack items
    }
  }
}
