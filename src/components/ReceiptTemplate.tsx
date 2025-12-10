import { forwardRef } from "react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface ReceiptItem {
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface ReceiptTemplateProps {
    receiptNumber: string;
    date: string;
    customerName?: string;
    items: ReceiptItem[];
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
    amountPaid: number;
    change: number;
    paymentMethod: string;
    businessName?: string;
    taxRate?: number;
    receiptFooter?: string;
}

export const ReceiptTemplate = forwardRef<HTMLDivElement, ReceiptTemplateProps>(
    (props, ref) => {
        const {
            receiptNumber,
            date,
            customerName,
            items,
            subtotal,
            tax,
            discount,
            total,
            amountPaid,
            change,
            paymentMethod,
            businessName = "POS SHOPPING",
            receiptFooter = "Thank you for your business!",
        } = props;

        const formatCurrency = useFormatCurrency();

        return (
            <div ref={ref} className="receipt-template">
                {/* Hidden from screen, shown in print */}
                <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .receipt-template, .receipt-template * {
              visibility: visible;
            }
            .receipt-template {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
              font-family: 'Courier New', monospace;
              font-size: 12px;
              line-height: 1.4;
              color: #000;
              background: #fff;
              padding: 10px;
            }
            @page {
              size: 80mm auto;
              margin: 0;
            }
          }

          @media screen {
            .receipt-template {
              display: none;
            }
          }
        `}</style>

                <div style={{ textAlign: "center", marginBottom: "10px", borderBottom: "1px dashed #000", paddingBottom: "10px" }}>
                    <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "5px" }}>
                        {businessName}
                    </div>
                    <div style={{ fontSize: "10px" }}>Professional Point of Sale</div>
                </div>

                <div style={{ marginBottom: "10px", fontSize: "11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Receipt: {receiptNumber}</span>
                    </div>
                    <div>{new Date(date).toLocaleString()}</div>
                    {customerName && <div>Customer: {customerName}</div>}
                    <div>Payment: {paymentMethod.toUpperCase()}</div>
                </div>

                <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "5px 0" }}>
                    <table style={{ width: "100%", fontSize: "11px" }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: "left" }}>Item</th>
                                <th style={{ textAlign: "center" }}>Qty</th>
                                <th style={{ textAlign: "right" }}>Price</th>
                                <th style={{ textAlign: "right" }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index}>
                                    <td style={{ textAlign: "left" }}>{item.product_name}</td>
                                    <td style={{ textAlign: "center" }}>{item.quantity}</td>
                                    <td style={{ textAlign: "right" }}>{formatCurrency(item.unit_price)}</td>
                                    <td style={{ textAlign: "right" }}>{formatCurrency(item.subtotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ marginTop: "10px", fontSize: "11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                        <span>Subtotal:</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {discount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                            <span>Discount:</span>
                            <span>- {formatCurrency(discount)}</span>
                        </div>
                    )}
                    {tax > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                            <span>Tax:</span>
                            <span>{formatCurrency(tax)}</span>
                        </div>
                    )}
                    <div style={{ borderTop: "1px solid #000", paddingTop: "5px", marginTop: "5px", display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "14px" }}>
                        <span>TOTAL:</span>
                        <span>{formatCurrency(total)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
                        <span>Paid:</span>
                        <span>{formatCurrency(amountPaid)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Change:</span>
                        <span>{formatCurrency(change)}</span>
                    </div>
                </div>

                <div style={{ textAlign: "center", marginTop: "15px", paddingTop: "10px", borderTop: "1px dashed #000", fontSize: "10px" }}>
                    <div>{receiptFooter}</div>
                    <div style={{ marginTop: "5px" }}>Visit Again!</div>
                </div>
            </div>
        );
    }
);

ReceiptTemplate.displayName = "ReceiptTemplate";
