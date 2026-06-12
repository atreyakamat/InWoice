import React from 'react';
import { API_BASE_URL } from '../apiConfig';

const InvoicePreview = ({ formData, items, subtotal, grandTotal, settings }) => {
    const logoUrl = settings.logo ? (settings.logo.startsWith('http') || settings.logo.startsWith('data:') ? settings.logo : `${API_BASE_URL}${settings.logo}`) : null;

    return (
        <div className="bg-white p-10 shadow-2xl rounded-lg border border-gray-100 min-h-[1000px] transform scale-[0.85] origin-top font-serif">
            <div className="flex justify-between border-b-2 border-purple-100 pb-6 mb-8">
                <div>
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-12 w-auto mb-2 object-contain" />
                    ) : (
                        <h1 className="text-3xl font-bold text-purple-600 uppercase tracking-tighter italic">{settings.businessName || 'Stix N Vibes'}</h1>
                    )}
                    <div className="text-xs text-gray-500 mt-2 space-y-1">
                        <p>{settings.address || '123 Sticker Ave, Art City'}</p>
                        <p>{settings.email || 'hello@stixnvibes.com'} | {settings.phone || '+1 234 567 890'}</p>
                        <p>{settings.website || 'instagram.com/stixnvibes'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h2 className="text-4xl font-black text-gray-200 uppercase mb-2">Invoice</h2>
                    <p className="text-xs font-bold text-gray-700"># SNV-2026-XXXX</p>
                    <p className="text-xs text-gray-500 mt-1">{formData.date}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-10">
                <div>
                    <h3 className="text-[10px] uppercase font-bold text-purple-400 mb-2 tracking-widest">Bill To</h3>
                    <p className="text-sm font-bold text-gray-800">{formData.customerName || 'Customer Name'}</p>
                    <div className="text-xs text-gray-500 mt-1 space-y-1">
                        <p>{formData.customerEmail || 'email@example.com'}</p>
                        <p>{formData.customerPhone}</p>
                        <p className="whitespace-pre-line">{formData.shippingAddress || 'Shipping Address'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <h3 className="text-[10px] uppercase font-bold text-purple-400 mb-2 tracking-widest">Payment Info</h3>
                    <div className="text-xs text-gray-500 space-y-1">
                        <p><span className="font-bold text-gray-700">Method:</span> {formData.paymentMethod}</p>
                        <p><span className="font-bold text-gray-700">Status:</span> {formData.paymentStatus}</p>
                        <p className="text-purple-600 font-bold">{settings.upiId || 'No UPI ID'}</p>
                        {formData.hsn_sac && (
                            <p><span className="font-bold text-gray-700">HSN/SAC:</span> {formData.hsn_sac}</p>
                        )}
                    </div>
                </div>
            </div>

            <table className="w-full text-left border-collapse mb-10">
                <thead>
                    <tr className="bg-purple-50 text-purple-700">
                        <th className="py-3 px-4 text-[10px] uppercase font-bold tracking-widest">Description</th>
                        <th className="py-3 px-4 text-[10px] uppercase font-bold tracking-widest text-center">Qty</th>
                        <th className="py-3 px-4 text-[10px] uppercase font-bold tracking-widest text-right">Price</th>
                        <th className="py-3 px-4 text-[10px] uppercase font-bold tracking-widest text-right">Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                        <tr key={i}>
                            <td className="py-4 px-4 flex items-center space-x-3">
                                {item.image && (
                                    <img src={`${API_BASE_URL}${item.image}`} alt={item.name} className="h-10 w-10 object-cover rounded border" />
                                )}
                                <div>
                                    <p className="text-sm font-bold text-gray-800">{item.name || 'Item Name'}</p>
                                    <p className="text-[10px] text-gray-400 italic mt-0.5">{item.variant || item.description}</p>
                                </div>
                            </td>
                            <td className="py-4 px-4 text-center text-sm">{item.quantity}</td>
                            <td className="py-4 px-4 text-right text-sm">{settings.defaultCurrency || '$'}{item.price}</td>
                            <td className="py-4 px-4 text-right text-sm font-bold text-purple-700">{settings.defaultCurrency || '$'}{item.total.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex justify-end pt-6 border-t-2 border-gray-50">
                <div className="w-64 space-y-2">
                    <div className="flex justify-between text-xs text-gray-400 font-bold">
                        <span>Subtotal</span>
                        <span>{settings.defaultCurrency || '$'}{subtotal.toFixed(2)}</span>
                    </div>
                    {formData.discount > 0 && (
                        <div className="flex justify-between text-xs text-red-400 font-bold">
                            <span>Discount</span>
                            <span>-{settings.defaultCurrency || '$'}{formData.discount}</span>
                        </div>
                    )}
                    {formData.shipping > 0 && (
                        <div className="flex justify-between text-xs text-gray-400 font-bold">
                            <span>Shipping</span>
                            <span>{settings.defaultCurrency || '$'}{formData.shipping}</span>
                        </div>
                    )}
                    {Number(formData.tax) > 0 && (
                        <div className="flex justify-between text-xs text-gray-400 font-bold">
                            <span>Other Tax</span>
                            <span>{settings.defaultCurrency || '$'}{Number(formData.tax).toFixed(2)}</span>
                        </div>
                    )}
                    {Number(formData.cgst) > 0 && (
                        <div className="flex justify-between text-xs text-gray-400 font-bold">
                            <span>CGST</span>
                            <span>{settings.defaultCurrency || '$'}{Number(formData.cgst).toFixed(2)}</span>
                        </div>
                    )}
                    {Number(formData.sgst) > 0 && (
                        <div className="flex justify-between text-xs text-gray-400 font-bold">
                            <span>SGST</span>
                            <span>{settings.defaultCurrency || '$'}{Number(formData.sgst).toFixed(2)}</span>
                        </div>
                    )}
                    {Number(formData.igst) > 0 && (
                        <div className="flex justify-between text-xs text-gray-400 font-bold">
                            <span>IGST</span>
                            <span>{settings.defaultCurrency || '$'}{Number(formData.igst).toFixed(2)}</span>
                        </div>
                    )}
                    {Number(formData.tds) > 0 && (
                        <div className="flex justify-between text-xs text-red-400 font-bold">
                            <span>TDS</span>
                            <span>-{settings.defaultCurrency || '$'}{Number(formData.tds).toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-lg font-black text-purple-800 pt-3 border-t border-purple-50">
                        <span>Total Due</span>
                        <span>{settings.defaultCurrency || '$'}{grandTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="mt-20 text-center border-t border-gray-50 pt-10 opacity-50">
                <p className="text-xs italic text-gray-400 mb-2">Thank you for supporting small creators like Stix N Vibes!</p>
                <h4 className="text-[10px] uppercase font-bold tracking-[0.3em] text-purple-600 italic underline">Spread the Vibe</h4>
            </div>
        </div>
    );
};

export default InvoicePreview;
