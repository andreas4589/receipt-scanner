// Server-side code (Node.js/Express)
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Add CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files (HTML, CSS, JS)
app.use(express.static('.'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.post('/process-receipt', upload.single('image'), (req, res) => {
    console.log('Received POST request to /process-receipt');
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imagePath = req.file.path;
    const outputJsonPath = 'extracted_products.json';
    
    console.log(`Processing image: ${imagePath}`);
    
    // Run the Python OCR script
    const pythonProcess = spawn('python', ['ocrtest.py', imagePath]);
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`Python output: ${data}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`Python error: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
        // Clean up uploaded file
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        
        if (code !== 0) {
            console.error(`Python script exited with code ${code}`);
            return res.status(500).json({ 
                error: 'OCR processing failed', 
                details: errorOutput 
            });
        }
        
        // Read the generated JSON file
        try {
            if (fs.existsSync(outputJsonPath)) {
                const jsonData = fs.readFileSync(outputJsonPath, 'utf8');
                const receiptData = JSON.parse(jsonData);
                
                // Clean up JSON file
                fs.unlinkSync(outputJsonPath);
                
                // --- FIX: AGGREGATE DUPLICATE PRODUCTS ---
                const aggregatedData = {};
                receiptData.products.forEach(item => {
                    const productName = item.product;
                    const price = item.price;
                    
                    if (aggregatedData[productName]) {
                        // If product already exists, add to its total
                        aggregatedData[productName] += price;
                    } else {
                        // Otherwise, add it to the new object
                        aggregatedData[productName] = price;
                    }
                });

                // Add the total back to the aggregated data
                aggregatedData.Totaal = receiptData.total_amount;
                
                res.json(aggregatedData);
            } else {
                res.status(500).json({ error: 'No output JSON file generated' });
            }
        } catch (error) {
            console.error('Error reading JSON output:', error);
            res.status(500).json({ error: 'Failed to parse OCR results' });
        }
    });
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Serve your index.html at the root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});