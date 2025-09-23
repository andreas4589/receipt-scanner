document.addEventListener('DOMContentLoaded', (event) => {
    // Select all checkbox elements on the page
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');

    // Loop through each checkbox and uncheck it
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    // Global Enter key handler - works anywhere on the page
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            // Only trigger if we're NOT in an input field
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
                console.log("Enter key pressed - calculating split");
                calculateSplit();
            }
        }
        
        // Camera shortcuts
        // Press 'C' to open camera (when not in an input field)
        if (e.key.toLowerCase() === 'c' && e.target.tagName !== 'INPUT') {
            e.preventDefault();
            openCamera();
        }
        
        // Press Space to take photo when camera is open
        if (e.key === ' ' && videoStream) {
            e.preventDefault();
            takePhoto();
        }
        
        // Press Escape to close camera
        if (e.key === 'Escape' && videoStream) {
            e.preventDefault();
            closeCamera();
        }
    });
});

let videoStream = null;

function openCamera() {
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('video');

    // Show camera container
    cameraContainer.style.display = "flex";

    // Request access to the camera
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: 'environment' // Use back camera if available (better for documents)
        } 
    })
    .then(stream => {
        videoStream = stream;
        video.srcObject = stream;
    })
    .catch(error => {
        console.error("Error accessing camera:", error);
        alert("Error accessing camera: " + error.message);
        closeCamera();
    });
}

function takePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current frame from video onto the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to blob (file-like object)
    canvas.toBlob(function(blob) {
        if (blob) {
            // Create a File object from the blob
            const timestamp = new Date().getTime();
            const file = new File([blob], `camera_capture_${timestamp}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now()
            });

            console.log("Photo captured, processing with OCR...");
            
            // Show loading animation
            showLoading();
            
            // Send the captured image to OCR processing
            processImageFile(file);
            
            // Close the camera
            closeCamera();
        } else {
            alert("Failed to capture photo. Please try again.");
        }
    }, 'image/jpeg', 0.8); // JPEG format with 80% quality
}

function processImageFile(file) {
    // Create FormData to send the file to server (same as readFile function)
    const formData = new FormData();
    formData.append('image', file);
    
    console.log("Processing captured image with OCR...");
    
    // Send file to server endpoint that runs ocrtest.py
    fetch('https://receipt-splitter-x5at.onrender.com/process-receipt', {  // Fixed: Added /process-receipt
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("OCR processing complete:", data);
        hideLoading();
        displayReceipt(data);
    })
    .catch(error => {
        console.error('Error processing receipt:', error);
        hideLoading();
        alert('Error processing receipt: ' + error.message);
    });
}

function closeCamera() {
    const cameraContainer = document.getElementById('camera-container');

    // Stop video stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    // Hide camera container
    cameraContainer.style.display = "none";
}

function showLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'none';
}

function extractNumberFromString(str) {
    // This regex matches numbers, including those with decimal points
    const match = str.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
}

function readFile(e) {
    const file = e.target.files[0];
    
    if (!file) {
        console.log("No file selected");
        return;
    }
    
    // Show loading animation
    showLoading();
    
    // Create FormData to send the file to server
    const formData = new FormData();
    formData.append('image', file);
    
    console.log("Processing image with OCR...");
    
    // Send file to server endpoint that runs ocrtest.py
    fetch('https://receipt-splitter-x5at.onrender.com/process-receipt', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("OCR processing complete:", data);
        hideLoading();
        displayReceipt(data);
    })
    .catch(error => {
        console.error('Error processing receipt:', error);
        hideLoading();
        alert('Error processing receipt: ' + error.message);
    });
    
    console.log("File sent for OCR processing");
}

function calculateSplit() {
    const table = document.getElementById("table-body");
    const rows = table.querySelectorAll("tr"); // Get all rows
    const lastRow = rows[rows.length - 1]; // The last row is always the total

    // Reset the last row's cells to 0 before recalculating
    for (let i = 2; i < lastRow.cells.length; i++) {
        lastRow.cells[i].textContent = '0.00';
    }

    // Loop through all rows EXCEPT the last one (which is the total row)
    for (let i = 0; i < rows.length - 1; i++) {
        const row = rows[i];
        const amountInput = row.cells[1].querySelector('input.amount-input');

        // Check if the amountInput element exists before trying to access its value
        if (!amountInput) {
            continue; // Skip this iteration if the element is not found
        }
        
        let amountString = amountInput.value.replace(',', '.');
        const amount = parseFloat(amountString);

        if (isNaN(amount)) {
            console.log(amount)
            alert("Please enter a valid number.");
            continue; // Skips to the next item in the loop
        }

        const checkboxes = row.querySelectorAll('input[type="checkbox"]:checked');
        const count = checkboxes.length;

        if (count > 0) {
            const splitAmount = amount / count;

            // Find the indices of the checked checkboxes
            const allCheckboxesInRow = Array.from(row.querySelectorAll('input[type="checkbox"]'));
            const checkedIndexes = allCheckboxesInRow
                .map((checkbox, index) => checkbox.checked ? index : null)
                .filter(index => index !== null);
            
            // Update the last row's cells for the checked indexes
            checkedIndexes.forEach(index => {
                const cell = lastRow.cells[index + 2];
                let currentTotal = parseFloat(cell.textContent);
                if (isNaN(currentTotal)) {
                    currentTotal = 0;
                }
                const newTotal = currentTotal + splitAmount;
                cell.textContent = newTotal.toFixed(2);
            });
        }
    }

    // UPDATE TOTAL COUNTER - This now happens every time calculateSplit is called
    updateTotalCounter();
}

function updateTotalCounter() {
    let totalSum = 0;
    const amountInputs = document.querySelectorAll('.amount-input');
    
    amountInputs.forEach(input => {
        // Skip the total counter itself to avoid adding it to the sum
        if (input.id !== 'total-counter') {
            const value = parseFloat(input.value.replace(',', '.'));
            if (!isNaN(value)) {
                totalSum += value;
            }
        }
    });

    const totalCounter = document.getElementById('total-counter');
    if (totalCounter) {
        totalCounter.value = totalSum.toFixed(2);
    } else {
        console.error('Element with ID "total-counter" not found.');
    }
}

function reset(){
    const rows = document.querySelectorAll('#table-body tr');
    const lastRow = rows[rows.length - 1]; // Get the last row
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');

    // Reset the last row's cells to 0 before recalculating
    for (let i = 2; i < lastRow.cells.length; i++) {
        lastRow.cells[i].textContent = '0.00'; // Reset to 0.00
    }

    checkboxes.forEach(checkbox => {
        checkbox.checked = false; // Uncheck each checkbox
      });

    flip1 = -1;
    flip2 = -1;
    flip3 = -1;
    flip4 = -1;
}

var flip1 = -1;
function checkAll1() {
    flip1 *= -1;
    const checkboxes = document.querySelectorAll('input[class = "checkbox1"]');

    checkboxes.forEach(checkbox => {
        if(flip1 == 1)
            checkbox.checked = true;
        else 
            checkbox.checked = false;
      });
}

var flip2 = -1;
function checkAll2() {
    flip2 *= -1;
    const checkboxes = document.querySelectorAll('input[class = "checkbox2"]');

    checkboxes.forEach(checkbox => {
        if(flip2 == 1)
            checkbox.checked = true;
        else 
            checkbox.checked = false;
      });
}

var flip3 = -1;
function checkAll3() {
    flip3 *= -1;
    const checkboxes = document.querySelectorAll('input[class = "checkbox3"]');

    checkboxes.forEach(checkbox => {
        if(flip3 == 1)
            checkbox.checked = true;
        else 
            checkbox.checked = false;
      });
}

var flip4 = -1;
function checkAll4() {
    flip4 *= -1;
    const checkboxes = document.querySelectorAll('input[class = "checkbox4"]');

    checkboxes.forEach(checkbox => {
        if(flip4 == 1)
            checkbox.checked = true;
        else 
            checkbox.checked = false;
      });
}

function displayReceipt(receipt){
    const total = receipt.Totaal;
    delete receipt["Totaal"];
    
    // Hide empty state and show table
    const emptyState = document.getElementById("empty-state");
    const tableContainer = document.querySelector(".table-container");
    if (emptyState) emptyState.style.display = "none";
    if (tableContainer) tableContainer.style.display = "block";
    
    const receiptContainer = document.getElementById("table-body");
    
    // Clear existing items (keep only the header row)
    const headerRow = receiptContainer.querySelector('thead tr');
    const tbody = receiptContainer.querySelector('tbody') || document.createElement('tbody');
    tbody.innerHTML = ''; // Clear tbody content
    
    // Ensure tbody exists
    if (!receiptContainer.querySelector('tbody')) {
        receiptContainer.appendChild(tbody);
    }

    for (let product in receipt)
    {
        let amount = receipt[product];
        let tr = document.createElement("tr");

        let productCell = document.createElement("td");
        let amountCell = document.createElement("td");

        // Euro symbol span
        let euroSpan = document.createElement("span");
        euroSpan.textContent = "€";

        // Numeric input
        let amountInput = document.createElement("input");
        amountInput.type = "text";    
        amountInput.value = amount.toFixed(2);
        amountInput.classList.add("amount-input");

        // Add event listener for Enter key to each amount input
        amountInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log("Enter key pressed in amount input - calculating split");
                calculateSplit();
            }
        });

        // Append both into the amount cell
        amountCell.appendChild(euroSpan);
        amountCell.appendChild(amountInput);

        // --- Other cells (checkboxes, etc.) ---
        let td3 = document.createElement("td");
        let td4 = document.createElement("td");
        let td5 = document.createElement("td");
        let td6 = document.createElement("td");

        // Check if this is a discount (negative amount)
        const isDiscount = amount < 0;
        productCell.textContent = product;
        productCell.className = "product-col";
        amountCell.className = "amount-col";
        
        // Apply discount styling if it's a negative amount
        if (isDiscount) {
            productCell.classList.add('discount-product');
            amountInput.classList.add('discount-price');
        }

        let i = 0;
        // Create checkboxes for columns 3-6
        [td3, td4, td5, td6].forEach(td => {
            i++;
            let checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = `checkbox${i}`;
            td.className = "person-col";
            td.appendChild(checkbox);
        });
        
        tr.appendChild(productCell);
        tr.appendChild(amountCell);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);
        tbody.appendChild(tr);
    }

    // Add the total row
    let tr = document.createElement("tr");
    tr.className = "total-row";

    // Product Cell
    let td1 = document.createElement("td");
    td1.textContent = "TOTAL";
    td1.className = "product-col";

    // Amount Cell
    let td2 = document.createElement("td");
    td2.className = "amount-col";

    let euroSpan = document.createElement("span");
    euroSpan.textContent = "€";

    let totalInput = document.createElement("input");
    totalInput.type = "text";
    totalInput.value = total.toFixed(2);
    totalInput.id = "total-counter";
    totalInput.classList.add("amount-input");
    totalInput.readOnly = true; // Make total read-only

    td2.appendChild(euroSpan);
    td2.appendChild(totalInput);

    // Split cells
    let td3 = document.createElement("td");
    let td4 = document.createElement("td");
    let td5 = document.createElement("td");
    let td6 = document.createElement("td");
    
    td3.className = td4.className = td5.className = td6.className = "person-col";
    td3.textContent = "€0.00";
    td4.textContent = "€0.00";
    td5.textContent = "€0.00";
    td6.textContent = "€0.00";

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    tbody.appendChild(tr);
}