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
    console.log('=== RECEIPT PROCESSING STARTED ===');
    console.log('Received POST request to /process-receipt');
    
    if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const imagePath = req.file.path;
    const outputJsonPath = 'extracted_products.json';
    
    console.log(`Processing image: ${imagePath}`);
    console.log(`File size: ${req.file.size} bytes`);
    console.log(`File mimetype: ${req.file.mimetype}`);
    
    // Check if Python script exists
    if (!fs.existsSync('ocrtest.py')) {
        console.error('ocrtest.py not found in current directory');
        console.log('Current directory contents:', fs.readdirSync('.'));
        return res.status(500).json({ error: 'OCR script not found' });
    }
    
    // Run the Python OCR script
    console.log('Starting Python process...');
    const pythonProcess = spawn('python', ['ocrtest.py', imagePath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log(`Python stdout: ${data}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error(`Python stderr: ${data}`);
    });
    
    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process: ${error.message}`);
        // Clean up uploaded file
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
        return res.status(500).json({ 
            error: 'Failed to start OCR process', 
            details: error.message 
        });
    });
    
    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code: ${code}`);
        console.log(`Python output: ${output}`);
        console.log(`Python errors: ${errorOutput}`);
        
        // Clean up uploaded file
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('Cleaned up uploaded file');
        }
        
        if (code !== 0) {
            console.error(`Python script failed with code ${code}`);
            return res.status(500).json({ 
                error: 'OCR processing failed', 
                details: errorOutput,
                code: code
            });
        }
        
        // Read the generated JSON file
        try {
            if (fs.existsSync(outputJsonPath)) {
                console.log('Reading JSON output file...');
                const jsonData = fs.readFileSync(outputJsonPath, 'utf8');
                const receiptData = JSON.parse(jsonData);
                
                console.log('Successfully parsed JSON:', receiptData);
                
                // Clean up JSON file
                fs.unlinkSync(outputJsonPath);
                
                // Aggregate duplicate products
                const aggregatedData = {};
                if (receiptData.products) {
                    receiptData.products.forEach(item => {
                        const productName = item.product;
                        const price = item.price;
                        
                        if (aggregatedData[productName]) {
                            aggregatedData[productName] += price;
                        } else {
                            aggregatedData[productName] = price;
                        }
                    });
                    
                    aggregatedData.Totaal = receiptData.total_amount;
                    res.json(aggregatedData);
                } else {
                    console.error('No products found in JSON output');
                    res.status(500).json({ error: 'No products extracted from receipt' });
                }
            } else {
                console.error(`Output JSON file not found: ${outputJsonPath}`);
                res.status(500).json({ error: 'No output JSON file generated' });
            }
        } catch (error) {
            console.error('Error reading/parsing JSON output:', error);
            res.status(500).json({ 
                error: 'Failed to parse OCR results',
                details: error.message
            });
        }
    });
    
    // Set a timeout for the Python process
    setTimeout(() => {
        if (!pythonProcess.killed) {
            console.log('Python process timeout, killing...');
            pythonProcess.kill();
        }
    }, 30000); // 30 second timeout
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