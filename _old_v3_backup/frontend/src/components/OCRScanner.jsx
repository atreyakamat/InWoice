import React, { useState, useRef } from 'react';
import { Camera, Loader2, FileText, CheckCircle } from 'lucide-react';
import Tesseract from 'tesseract.js';

const OCRScanner = ({ onScanComplete }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState('');
    const fileInputRef = useRef(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsScanning(true);
        setProgress(0);
        setResult('');

        try {
            const imageUrl = URL.createObjectURL(file);
            
            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        setProgress(parseInt(m.progress * 100));
                    }
                }
            });
            
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            const { data: { text } } = await worker.recognize(imageUrl);
            await worker.terminate();

            setResult(text);
            if (onScanComplete) {
                onScanComplete(text);
            }
        } catch (error) {
            console.error('OCR Error:', error);
            alert('Failed to scan image. Please try again.');
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold mb-4 text-purple-700 flex items-center">
                <FileText className="mr-2" size={20} />
                Scan Account Book
            </h2>
            
            <div className="border-2 border-dashed border-purple-200 rounded-xl p-8 text-center bg-purple-50 hover:bg-purple-100 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                />
                
                {isScanning ? (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="animate-spin text-purple-600" size={32} />
                        <div className="w-full max-w-xs bg-gray-200 rounded-full h-2.5">
                            <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p className="text-sm font-bold text-purple-600 uppercase tracking-widest">Scanning... {progress}%</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="p-4 bg-white rounded-full shadow-sm">
                            <Camera className="text-purple-500" size={32} />
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">Tap to Scan</p>
                            <p className="text-xs text-gray-500 mt-1">Take a photo of your account book or receipt</p>
                        </div>
                    </div>
                )}
            </div>

            {result && (
                <div className="mt-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center">
                        <CheckCircle size={14} className="mr-1 text-green-500" /> Extracted Text
                    </h3>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                        {result}
                    </div>
                </div>
            )}
        </div>
    );
};

export default OCRScanner;