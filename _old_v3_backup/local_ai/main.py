from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from transformers import pipeline
import json
import re
import io
import pdfplumber
import pytesseract
from PIL import Image

app = FastAPI(title="Local Invoice AI")

print("=========================================================")
print("Loading local model...")
print("If this is your first run, it will download model weights (~3GB).")
print("=========================================================")

model_id = "Qwen/Qwen2.5-1.5B-Instruct"

pipe = pipeline(
    "text-generation",
    model=model_id,
    device_map="auto"
)
print("Local model loaded successfully!")

class ParseRequest(BaseModel):
    text: str

@app.post("/parse")
def parse_text(request: ParseRequest):
    system_prompt = """You are an AI that extracts invoice data from spoken text.
    Extract the data and return ONLY a valid JSON object. No markdown formatting, no backticks, no explanations.
    Schema to strictly follow:
    {
        "customerName": "string or empty",
        "customerEmail": "string or empty",
        "customerPhone": "string or empty",
        "items": [
            { "name": "string", "quantity": number, "price": number }
        ],
        "autoSend": boolean (Set to true ONLY IF the text explicitly mentions sending, emailing, or shooting the invoice)
    }"""

    user_prompt = f"Text to analyze: '{request.text}'"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    outputs = pipe(
        messages,
        max_new_tokens=256,
        temperature=0.1,
        do_sample=True
    )

    generated_text = outputs[0]["generated_text"][-1]["content"]
    cleaned_text = re.sub(r'```json|```', '', generated_text).strip()
    
    try:
        parsed_data = json.loads(cleaned_text)
        return parsed_data
    except json.JSONDecodeError:
        print("Failed to parse output:", cleaned_text)
        return {"error": "Model did not return valid JSON", "raw_output": cleaned_text}

@app.post("/ocr-bank-statement")
async def ocr_bank_statement(file: UploadFile = File(...)):
    text = ""
    contents = await file.read()
    
    try:
        if file.filename.lower().endswith('.pdf'):
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                for page in pdf.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
        elif file.filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            image = Image.open(io.BytesIO(contents))
            text = pytesseract.image_to_string(image)
    except Exception as e:
        return {"error": f"Failed to read file: {str(e)}"}
        
    if not text.strip():
        return {"error": "Could not extract any text from the document."}
        
    system_prompt = """You are a financial AI. Extract all bank transactions from the provided bank statement text.
    Return ONLY a valid JSON object representing a list of transactions. No markdown, no explanations.
    Schema to strictly follow:
    {
        "transactions": [
            { "date": "YYYY-MM-DD", "description": "string", "amount": number, "type": "Debit" or "Credit" }
        ]
    }"""
    
    user_prompt = f"Bank statement text:\n{text[:3000]}"
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    outputs = pipe(
        messages,
        max_new_tokens=512,
        temperature=0.1,
        do_sample=True
    )
    
    generated_text = outputs[0]["generated_text"][-1]["content"]
    cleaned_text = re.sub(r'```json|```', '', generated_text).strip()
    
    try:
        parsed_data = json.loads(cleaned_text)
        return {"text_preview": text[:500], "data": parsed_data}
    except json.JSONDecodeError:
        return {"error": "Model did not return valid JSON", "raw_output": cleaned_text, "text_preview": text[:500]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
