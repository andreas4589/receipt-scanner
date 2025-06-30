let videoStream = null;

function openCamera() {
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('video');

    // Show camera container
    cameraContainer.style.display = "flex";

    // Request access to the camera
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            videoStream = stream;
            video.srcObject = stream;
        })
        .catch(error => {
            alert("Error accessing camera: " + error);
            closeCamera();
        });
}

function takePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const imgElement = document.getElementById('captured-photo');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current frame from video onto the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert the image to a data URL (optional: for saving or preview)
    const imageData = canvas.toDataURL("image/png");
    imgElement.src = imageData;

    alert("Photo captured!");
    saveImage(imageData);

    // Close the camera
    closeCamera();
}

function saveImage(imageData) {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `captured_photo_${new Date().getTime()}.png`; // Unique filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function closeCamera() {
    const cameraContainer = document.getElementById('camera-container');

    // Stop video stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    // Hide camera container
    cameraContainer.style.display = "none";
}

function uploadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const imageData = e.target.result;

        // Update image preview
        document.getElementById("captured-photo").src = imageData;

        // Send image to backend
        
    };
    scanReceipt(event);
    reader.readAsDataURL(file);
}

function scanReceipt(image) {
    fetch("http://localhost:5000/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: image })
    })
    .then(response => response.json())
    .then(data => {
        console.log("Python Script Output:", data.output);
        alert("Scan result: " + data.output);
    })
    .catch(error => console.error("Error:", error));
}

function extractNumberFromString(str) {
    // This regex matches numbers, including those with decimal points
    const match = str.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

function readFile(e){
    const file = e.target.files[0];

    // Read the file
    const reader = new FileReader();
    reader.onload = () => {
        const data = JSON.parse(reader.result);
        console.log(data);
        displayReceipt(data);
    };
    reader.readAsText(file);
    console.log("File read");
}

function calculateSplit() {
    const rows = document.querySelectorAll('#table-body tr');
    const lastRow = rows[rows.length - 1]; // Get the last row
    
    // Reset the last row's cells to 0 before recalculating
    for (let i = 2; i < lastRow.cells.length; i++) {
        lastRow.cells[i].textContent = '0.00'; // Reset to 0.00
    }
    
    rows.forEach(row => {
        const amountCell = row.cells[1];
        const amount = parseFloat(amountCell.textContent.replace('€', ''));
        const checkboxes = row.querySelectorAll('input[type="checkbox"]:checked');
        const count = checkboxes.length;
        const checkedIndexes = Array.from(row.querySelectorAll('input[type="checkbox"]'))
            .map((checkbox, index) => checkbox.checked ? index : null) // Map to index if checked, otherwise null
            .filter(index => index !== null); // Filter out null values
        
        if (count > 0) {
            const splitAmount = (amount / count).toFixed(2);
            // Update the last row's cells for the checked indexes
            checkedIndexes.forEach(index => {
                console.log(index);
                const cell = lastRow.cells[index + 2]; // Adjust index if necessary
                let num = parseFloat(cell.textContent);
                if (isNaN(num)) {
                    num = 0; // Handle NaN values
                }
                cell.textContent = (num + parseFloat(splitAmount)).toFixed(2); // Update the cell content
            });
        }
    });
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
    //const checkboxes = document.getElementsByClassName("checkbox1");
    const checkboxes = document.querySelectorAll('input[class = "checkbox1"]');

    checkboxes.forEach(checkbox => {
        if(flip1 == 1)
            checkbox.checked = true; // Uncheck each checkbox
        else 
            checkbox.checked = false; // Uncheck each checkbox
      });
}

var flip2 = -1;
function checkAll2() {
    flip2 *= -1;
    //const checkboxes = document.getElementsByClassName("checkbox1");
    const checkboxes = document.querySelectorAll('input[class = "checkbox2"]');

    checkboxes.forEach(checkbox => {
        if(flip2 == 1)
            checkbox.checked = true; // Uncheck each checkbox
        else 
            checkbox.checked = false; // Uncheck each checkbox
      });
}

var flip3 = -1;
function checkAll3() {
    flip3 *= -1;
    //const checkboxes = document.getElementsByClassName("checkbox1");
    const checkboxes = document.querySelectorAll('input[class = "checkbox3"]');

    checkboxes.forEach(checkbox => {
        if(flip3 == 1)
            checkbox.checked = true; // Uncheck each checkbox
        else 
            checkbox.checked = false; // Uncheck each checkbox
      });
}

var flip4 = -1;
function checkAll4() {
    flip4 *= -1;
    //const checkboxes = document.getElementsByClassName("checkbox1");
    const checkboxes = document.querySelectorAll('input[class = "checkbox4"]');

    checkboxes.forEach(checkbox => {
        if(flip4 == 1)
            checkbox.checked = true; // Uncheck each checkbox
        else 
            checkbox.checked = false; // Uncheck each checkbox
      });
}

function displayReceipt(receipt){
    const total = receipt.Totaal;
    delete receipt["Totaal"];

    const receiptContainer = document.getElementById("table-body");

    for (let product in receipt)
    {
        let checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        let amount = receipt[product];
        let tr = document.createElement("tr");
        let td1= document.createElement("td");
        let td2= document.createElement("td");
        let td3= document.createElement("td");
        let td4= document.createElement("td");
        let td5= document.createElement("td");
        let td6= document.createElement("td");
        td1.textContent = product;
        td2.textContent = `€${amount.toFixed(2)}`;

        let i = 0;
        // Create checkboxes for columns 3-6
        [td3, td4, td5, td6].forEach(td => {
            i++;
            let checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = `checkbox${i}`
            td.appendChild(checkbox);
        });
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);
        receiptContainer.appendChild(tr);
    }
    let tr = document.createElement("tr");
    let td1= document.createElement("td");
    let td2= document.createElement("td");
    let td3= document.createElement("td");
    let td4= document.createElement("td");
    let td5= document.createElement("td");
    let td6= document.createElement("td");
    td1.textContent = "Total";
    td2.textContent = total;
    td3.textContent = "0.00";
    td4.textContent = "0.00";
    td5.textContent = "0.00";
    td6.textContent = "0.00";
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);
    receiptContainer.appendChild(tr);
}

