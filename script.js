document.addEventListener('DOMContentLoaded', (event) => {
    // Select all checkbox elements on the page
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');

    // Loop through each checkbox and uncheck it
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
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
            facingMode: 'environment', // Use back camera if available (better for documents)
            width: { ideal: 4096 },  
            height: { ideal: 2160 }, 
            advanced: [{ focusMode: "continuous" }, { exposureMode: "continuous" }]
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
    }, 'image/jpeg', 1.0);
}

function processImageFile(file) {
    // Create FormData to send the file to server
    const formData = new FormData();
    formData.append('image', file);
    
    console.log("Processing captured image with OCR...");
    
    // Determine server URL - use localhost for development
    const serverUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
    
    // Send file to server endpoint that runs ocrtest.py
    fetch(`${serverUrl}/process-receipt`, {
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
    
    // Determine server URL - use localhost for development
    const serverUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
    
    // Send file to server endpoint that runs ocrtest.py
    fetch(`${serverUrl}/process-receipt`, {
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

/**
 * Creates the HTML structure for the checkbox and weight input in a person's column.
 */
function createPersonControls(personIndex) {
    const container = document.createElement("div");
    container.className = "split-control-container";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = `checkbox${personIndex}`;
    
    // Toggle the input and set default value when checked
    checkbox.addEventListener('change', function() {
        const input = this.nextElementSibling;
        if (this.checked) {
            input.style.display = 'inline-block';
            input.value = 1; // Default to 1
        } else {
            input.style.display = 'none';
            input.value = 0; // Set value to 0 when unchecked
        }
        calculateSplit();
    });

    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.value = 0;
    weightInput.min = 0;
    weightInput.classList.add("split-weight-input");
    weightInput.style.display = 'none'; // Hidden by default
    
    // Recalculate split when weight changes
    weightInput.addEventListener('input', calculateSplit);
    weightInput.addEventListener('change', function() {
        // Ensure input is an integer and non-negative
        this.value = Math.max(0, parseInt(this.value) || 0);
        calculateSplit();
    });
    
    container.appendChild(checkbox);
    container.appendChild(weightInput);
    
    return container;
}

function addProductRow() {
    const tableContainer = document.querySelector(".table-container");
    const emptyState = document.getElementById("empty-state");
    const tbody = document.querySelector("#table-body tbody");
    
    // If table doesn't exist yet, create initial structure
    if (!tbody) {
        // Hide empty state and show table
        if (emptyState) emptyState.style.display = "none";
        if (tableContainer) tableContainer.style.display = "block";
        
        // Create tbody if it doesn't exist
        const table = document.getElementById("table-body");
        const newTbody = document.createElement('tbody');
        table.appendChild(newTbody);
        
        // Create initial total row
        createTotalRow(newTbody);
    }
    
    const currentTbody = document.querySelector("#table-body tbody");
    const totalRow = currentTbody.querySelector('.total-row');
    
    // Create new product row
    let tr = document.createElement("tr");
    tr.classList.add("manual-row");

    // Product name cell with input
    let productCell = document.createElement("td");
    productCell.className = "product-col";
    let productInput = document.createElement("input");
    productInput.type = "text";
    productInput.placeholder = "Enter product name...";
    productInput.classList.add("product-input");
    
    // Add event listener for Enter key navigation
    productInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Move focus to amount input in same row
            const amountInput = this.closest('tr').querySelector('.amount-input');
            if (amountInput) amountInput.focus();
        }
    });
    
    productCell.appendChild(productInput);

    // Amount cell with input
    let amountCell = document.createElement("td");
    amountCell.className = "amount-col";
    
    let euroSpan = document.createElement("span");
    euroSpan.textContent = "€";

    let amountInput = document.createElement("input");
    amountInput.type = "text";    
    amountInput.value = "0.00";
    amountInput.placeholder = "0.00";
    amountInput.classList.add("amount-input");

    // Add event listeners
    amountInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            calculateSplit();
        }
    });
    
    // Update total when amount changes
    amountInput.addEventListener('input', function() {
        updateTotalCounter();
        calculateSplit();
    });

    amountCell.appendChild(euroSpan);
    amountCell.appendChild(amountInput);

    // Create checkbox/weight cells
    let td3 = document.createElement("td");
    let td4 = document.createElement("td");
    let td5 = document.createElement("td");
    let td6 = document.createElement("td");

    [td3, td4, td5, td6].forEach((td, index) => {
        td.className = "person-col";
        td.appendChild(createPersonControls(index + 1));
    });
    
    // Add delete button cell
    let deleteCell = document.createElement("td");
    deleteCell.className = "delete-col";
    let deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete this row";
    deleteBtn.onclick = function() {
        tr.remove();
        updateTotalCounter();
        calculateSplit();
        // If no more rows except total, show empty state
        const remainingRows = currentTbody.querySelectorAll('tr:not(.total-row)');
        if (remainingRows.length === 0) {
            if (emptyState) emptyState.style.display = "block";
            if (tableContainer) tableContainer.style.display = "none";
        }
    };
    deleteCell.appendChild(deleteBtn);
    
    tr.appendChild(productCell);
    tr.appendChild(amountCell);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    tr.appendChild(deleteCell);
    
    // Insert before total row
    if (totalRow) {
        currentTbody.insertBefore(tr, totalRow);
    } else {
        currentTbody.appendChild(tr);
        // Create total row if it doesn't exist
        createTotalRow(currentTbody);
    }
    
    // Focus on product name input
    productInput.focus();
    
    // Update total counter
    updateTotalCounter();
}

function createTotalRow(tbody) {
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
    totalInput.value = "0.00";
    totalInput.id = "total-counter";
    totalInput.classList.add("amount-input");
    totalInput.readOnly = true;

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
    
    // Empty delete cell for alignment
    let td7 = document.createElement("td");
    td7.className = "delete-col";

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    tr.appendChild(td7);
    tbody.appendChild(tr);
}

function calculateSplit() {
    const table = document.getElementById("table-body");
    const rows = table.querySelectorAll("tr");
    const lastRow = rows[rows.length - 1];

    // Reset the last row's cells to 0 before recalculating
    for (let i = 2; i < lastRow.cells.length - 1; i++) {
        lastRow.cells[i].textContent = '0.00';
    }

    // Loop through all rows EXCEPT the last one (which is the total row)
    for (let i = 0; i < rows.length - 1; i++) {
        const row = rows[i];
        const amountInput = row.cells[1].querySelector('input.amount-input');

        if (!amountInput) {
            continue;
        }
        
        let amountString = amountInput.value.replace(',', '.');
        const amount = parseFloat(amountString);

        if (isNaN(amount)) {
            continue;
        }

        // Get weight inputs
        const weightInputs = Array.from(row.cells).slice(2, 6)
            .map(cell => cell.querySelector('.split-weight-input'));

        let totalWeight = 0;
        const weights = weightInputs.map(input => {
            const weight = parseFloat(input.value) || 0;
            if (weight > 0) {
                totalWeight += weight;
            }
            return weight;
        });

        if (totalWeight > 0) {
            // Distribute the amount proportionally based on weight
            weights.forEach((weight, index) => {
                if (weight > 0) {
                    const splitAmount = amount * (weight / totalWeight);

                    // Update the last row's cell for this person
                    const cell = lastRow.cells[index + 2];
                    let currentTotal = parseFloat(cell.textContent) || 0;
                    const newTotal = currentTotal + splitAmount;
                    cell.textContent = newTotal.toFixed(2);
                }
            });
        }
    }

    // Update total counter
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
    const lastRow = rows[rows.length - 1];
    
    // Reset the last row's split totals (excluding the total counter and delete column)
    for (let i = 2; i < lastRow.cells.length - 1; i++) {
        lastRow.cells[i].textContent = '0.00';
    }

    // Reset all checkboxes and weight inputs
    const controls = document.querySelectorAll('.split-control-container');
    controls.forEach(container => {
        const checkbox = container.querySelector('input[type="checkbox"]');
        const weightInput = container.querySelector('.split-weight-input');
        
        if (checkbox) checkbox.checked = false;
        if (weightInput) {
            weightInput.value = 0;
            weightInput.style.display = 'none';
        }
    });

    flip1 = -1;
    flip2 = -1;
    flip3 = -1;
    flip4 = -1;
}

var flip1 = -1;
function checkAll1() {
    flip1 *= -1;
    const checkboxes = document.querySelectorAll('.split-control-container input[class = "checkbox1"]');

    checkboxes.forEach(checkbox => {
        const weightInput = checkbox.nextElementSibling;
        
        if(flip1 == 1) {
            checkbox.checked = true;
            weightInput.style.display = 'inline-block';
            weightInput.value = 1;
        } else {
            checkbox.checked = false;
            weightInput.style.display = 'none';
            weightInput.value = 0;
        }
    });
    calculateSplit();
}

var flip2 = -1;
function checkAll2() {
    flip2 *= -1;
    const checkboxes = document.querySelectorAll('.split-control-container input[class = "checkbox2"]');

    checkboxes.forEach(checkbox => {
        const weightInput = checkbox.nextElementSibling;
        
        if(flip2 == 1) {
            checkbox.checked = true;
            weightInput.style.display = 'inline-block';
            weightInput.value = 1;
        } else {
            checkbox.checked = false;
            weightInput.style.display = 'none';
            weightInput.value = 0;
        }
    });
    calculateSplit();
}

var flip3 = -1;
function checkAll3() {
    flip3 *= -1;
    const checkboxes = document.querySelectorAll('.split-control-container input[class = "checkbox3"]');

    checkboxes.forEach(checkbox => {
        const weightInput = checkbox.nextElementSibling;
        
        if(flip3 == 1) {
            checkbox.checked = true;
            weightInput.style.display = 'inline-block';
            weightInput.value = 1;
        } else {
            checkbox.checked = false;
            weightInput.style.display = 'none';
            weightInput.value = 0;
        }
    });
    calculateSplit();
}

var flip4 = -1;
function checkAll4() {
    flip4 *= -1;
    const checkboxes = document.querySelectorAll('.split-control-container input[class = "checkbox4"]');

    checkboxes.forEach(checkbox => {
        const weightInput = checkbox.nextElementSibling;
        
        if(flip4 == 1) {
            checkbox.checked = true;
            weightInput.style.display = 'inline-block';
            weightInput.value = 1;
        } else {
            checkbox.checked = false;
            weightInput.style.display = 'none';
            weightInput.value = 0;
        }
    });
    calculateSplit();
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

        // Add event listener for automatic total calculation
        amountInput.addEventListener('input', function() {
            updateTotalCounter();
            calculateSplit();
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

        // Create checkbox/weight cells
        [td3, td4, td5, td6].forEach((td, index) => {
            td.className = "person-col";
            td.appendChild(createPersonControls(index + 1));
        });
        
        // Add delete button for OCR rows too
        let deleteCell = document.createElement("td");
        deleteCell.className = "delete-col";
        let deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = "🗑️";
        deleteBtn.className = "delete-btn";
        deleteBtn.title = "Delete this row";
        deleteBtn.onclick = function() {
            tr.remove();
            updateTotalCounter();
            calculateSplit();
            // If no more rows except total, show empty state
            const tbody = document.querySelector("#table-body tbody");
            const remainingRows = tbody.querySelectorAll('tr:not(.total-row)');
            if (remainingRows.length === 0) {
                const emptyState = document.getElementById("empty-state");
                const tableContainer = document.querySelector(".table-container");
                if (emptyState) emptyState.style.display = "block";
                if (tableContainer) tableContainer.style.display = "none";
            }
        };
        deleteCell.appendChild(deleteBtn);
        
        tr.appendChild(productCell);
        tr.appendChild(amountCell);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);
        tr.appendChild(deleteCell);
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

    // Empty delete cell for alignment
    let td7 = document.createElement("td");
    td7.className = "delete-col";

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    tr.appendChild(td7);
    tbody.appendChild(tr);
}