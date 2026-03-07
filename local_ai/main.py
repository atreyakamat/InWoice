from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline
import json
import re

app = FastAPI(title="Local Invoice AI")

print("=========================================================")
print("Loading local model...")
print("If this is your first run, it will download model weights (~3GB).")
print("=========================================================")

# Using a lightweight, highly capable instruction-tuned model.
model_id = "Qwen/Qwen2.5-1.5B-Instruct"

# Load the Hugging Face pipeline
pipe = pipeline(
    "text-generation",
    model=model_id,
    device_map="auto" # Automatically offloads to GPU if available
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

    # Qwen models use the ChatML template
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    # Generate response
    outputs = pipe(
        messages,
        max_new_tokens=256,
        temperature=0.1,
        do_sample=True
    )

    # Extract the assistant's reply
    generated_text = outputs[0]["generated_text"][-1]["content"]
    
    # Clean up any potential markdown code blocks
    cleaned_text = re.sub(r'```json|```', '', generated_text).strip()
    
    try:
        parsed_data = json.loads(cleaned_text)
        return parsed_data
    except json.JSONDecodeError:
        print("Failed to parse output:", cleaned_text)
        return {"error": "Model did not return valid JSON", "raw_output": cleaned_text}

if __name__ == "__main__":
    import uvicorn
    # Run the API on port 8000
    uvicorn.run(app, host="127.0.0.1", port=8000)
