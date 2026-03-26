# InWoice 🧾

**InWoice** is a modern, AI-powered invoice management system designed to streamline your invoicing workflow from 3 minutes to just 20 seconds. Built with React, Node.js, and intelligent AI parsing, InWoice offers voice-to-invoice conversion, automated email delivery, Google Sheets integration, and comprehensive analytics.

## ✨ Features

### Core Functionality
- **🎙️ AI Voice/Text Invoice Creation** - Convert spoken or written text into structured invoices using:
  - Local Python AI (Qwen 2.5 1.5B - runs offline)
  - Ollama integration (for local LLM deployment)
  - Google Gemini API (cloud fallback)
- **📄 PDF Generation** - Professional invoice PDFs with QR code integration
- **📧 Automated Email Delivery** - Send invoices directly to customers via email
- **📊 Google Sheets Integration** - Automatic data sync with Google Sheets
- **🔍 Real-time Invoice Preview** - Live WYSIWYG invoice editing
- **📱 Responsive Design** - Beautiful UI built with Tailwind CSS
- **🌐 Public Invoice Viewing** - Share invoices via unique URLs

### Management & Analytics
- **📋 Invoice Management** - Create, view, edit, and track invoices
- **🛍️ Product Catalog** - Manage products with variants
- **👥 Customer Management** - Store customer information
- **📈 Analytics Dashboard** - Revenue tracking and insights
- **⚙️ Customizable Settings** - Configure business details, payment info, and branding

### Technical Highlights
- **Draft Auto-Save** - Never lose your work with automatic local storage
- **Multiple AI Backends** - Flexible AI provider configuration
- **QR Code Support** - Embedded payment QR codes
- **Modular Architecture** - Clean separation of frontend/backend

## 🏗️ Tech Stack

### Frontend
- **React** 18.3.1 - Modern UI library
- **React Router** 7.13.1 - Client-side routing
- **Axios** - HTTP client
- **Tailwind CSS** 3.4.15 - Utility-first styling
- **Recharts** - Data visualization
- **Lucide React** - Icon library

### Backend
- **Node.js** with Express.js
- **Google Generative AI** (Gemini)
- **Google Sheets API** - Data integration
- **Puppeteer** - PDF generation
- **Nodemailer** - Email delivery
- **QR Code** - QR code generation
- **Axios** - HTTP client

### AI/ML
- **Python FastAPI** - Local AI microservice
- **Transformers** (Hugging Face) - ML model serving
- **Qwen 2.5 1.5B Instruct** - Lightweight local LLM
- **Ollama** (optional) - Local LLM runtime

## 📦 Installation

### Prerequisites
- **Node.js** 16.x or higher
- **npm** or **yarn**
- **Python** 3.8+ (for local AI features)
- **Git**

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/atreyakamat/InWoice.git
cd InWoice
```

2. **Install dependencies**
```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install local AI dependencies (optional)
cd local_ai
pip install -r requirements.txt
cd ..
```

3. **Configure environment variables**

Create a `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Server Configuration
PORT=5000

# AI Configuration (choose one or more)
USE_LOCAL_PYTHON_AI=false
LOCAL_AI_URL=http://127.0.0.1:8000/parse

USE_OLLAMA_AI=false
OLLAMA_URL=http://localhost:11434/api/chat
OLLAMA_MODEL=qwen2.5:1.5b

GEMINI_API_KEY=your_gemini_api_key_here

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Google Sheets Configuration (optional)
GOOGLE_SHEETS_CREDENTIALS_PATH=./credentials.json
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
```

4. **Start the application**

**Option A: All Services**
```bash
# Terminal 1: Start backend
cd backend
node server.js

# Terminal 2: Start frontend
cd frontend
npm start

# Terminal 3: Start local AI (optional)
cd local_ai
python main.py
```

**Option B: Backend + Frontend only (using Gemini API)**
```bash
# Terminal 1: Start backend
cd backend
node server.js

# Terminal 2: Start frontend
cd frontend
npm start
```

5. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Local AI (if running): http://localhost:8000

## 🚀 Usage

### Creating an Invoice (Traditional)
1. Navigate to **Create Invoice** from the sidebar
2. Fill in customer details (name, email, phone, etc.)
3. Add items with quantity and price
4. Preview the invoice in real-time
5. Click **Generate & Send** to create PDF and email

### Creating an Invoice (AI-Powered) 🎙️
1. Navigate to **Create Invoice**
2. Click the **microphone icon** or **AI text input**
3. Speak or type: *"Create invoice for John Doe, john@example.com, 2 stickers at $5 each, send it"*
4. AI extracts all data and fills the form automatically
5. Review and send with one click

### Managing Products
1. Go to **Products** section
2. Add products with name, category, description, and variants
3. Products auto-populate in invoice creation

### Viewing Analytics
- Navigate to **Analytics** to see:
  - Total revenue
  - Invoice count
  - Payment status breakdown
  - Monthly trends

## 🔧 Configuration

### AI Provider Setup

**Option 1: Local Python AI (Recommended for Privacy)**
```bash
cd local_ai
python main.py
# First run downloads ~3GB model weights
```
Set in `.env`:
```env
USE_LOCAL_PYTHON_AI=true
LOCAL_AI_URL=http://127.0.0.1:8000/parse
```

**Option 2: Ollama (Fast Local LLM)**
```bash
# Install Ollama: https://ollama.ai
ollama pull qwen2.5:1.5b
ollama serve
```
Set in `.env`:
```env
USE_OLLAMA_AI=true
OLLAMA_MODEL=qwen2.5:1.5b
```

**Option 3: Google Gemini (Cloud API)**
Get API key from: https://makersuite.google.com/app/apikey

Set in `.env`:
```env
GEMINI_API_KEY=your_actual_api_key
```

### Email Setup (Gmail)
1. Enable 2-Factor Authentication on your Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use the 16-character app password in `.env`

### Google Sheets Integration
1. Create a Google Cloud Project
2. Enable Google Sheets API
3. Create a Service Account and download credentials JSON
4. Place `credentials.json` in `backend/` directory
5. Share your spreadsheet with the service account email
6. Add spreadsheet ID to `.env`

## 📁 Project Structure

```
InWoice/
├── backend/
│   ├── routes/           # API route handlers
│   │   ├── aiRoutes.js
│   │   ├── invoiceRoutes.js
│   │   ├── emailRoutes.js
│   │   ├── productRoutes.js
│   │   └── sheetRoutes.js
│   ├── services/         # Business logic
│   │   ├── pdfService.js
│   │   ├── emailService.js
│   │   └── googleSheetsService.js
│   ├── utils/            # Utilities
│   ├── server.js         # Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   └── App.js
│   ├── public/
│   └── package.json
├── local_ai/
│   ├── main.py           # FastAPI AI service
│   └── requirements.txt
├── package.json          # Root dependencies
└── README.md
```

## 🔐 Security Notes

- **Never commit** `.env` files or `credentials.json` to version control
- Store sensitive credentials in environment variables
- Use app passwords for email (not your main password)
- Restrict Google Sheets service account permissions
- Review `.gitignore` to ensure secrets are excluded

## 🐛 Troubleshooting

### AI not working
- **Local Python AI**: Ensure `main.py` is running on port 8000
- **Ollama**: Check `ollama list` to verify model is installed
- **Gemini**: Verify API key is valid and has quota

### Email not sending
- Confirm Gmail app password is correct (16 chars, no spaces)
- Check EMAIL_USER and EMAIL_PASS in `.env`
- Ensure 2FA is enabled on Google account

### PDF generation issues
- Verify Puppeteer is installed: `npm list puppeteer`
- On Linux, install dependencies: `sudo apt-get install -y chromium-browser`

### Port conflicts
- Backend (5000), Frontend (3000), Local AI (8000) must be free
- Change ports in `.env` and frontend API calls if needed

## 📈 Roadmap

- [ ] Multi-user authentication and authorization
- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Invoice templates and themes
- [ ] Recurring invoices
- [ ] Payment gateway integration (Stripe, PayPal)
- [ ] Mobile app (React Native)
- [ ] Invoice version history
- [ ] Multi-language support
- [ ] Advanced reporting and exports
- [ ] Client portal for invoice viewing/payment

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Atreya Kamat**
- GitHub: [@atreyakamat](https://github.com/atreyakamat)

## 🙏 Acknowledgments

- [Qwen Team](https://github.com/QwenLM) - Lightweight instruction-tuned models
- [Hugging Face](https://huggingface.co) - Transformers library
- [Google](https://ai.google.dev/) - Gemini API
- [Ollama](https://ollama.ai) - Local LLM runtime
- All open-source contributors

## 💡 Support

If you find this project helpful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs via GitHub Issues
- 💬 Sharing feedback and feature requests
- 🤝 Contributing code improvements

---

**Built with ❤️ by Atreya Kamat**
