import json
import requests
import sys
from datetime import datetime

# url = "https://ocr.asprise.com/api/v1/receipt"

# def scan_receipt(image):
#     print("Scanning receipt...")

#     # Send the request to Asprise API
#     res = requests.post(url,
#                         data = {
#                             'api_key': 'TEST',
#                             'recognizer': 'auto',
#                             'ref_no': 'oct_python_123'
#                         },
#                         files = {
#                             'file': open(image, 'rb')
#                         })

#     if res.status_code != 200:
#         print(f"Error: {res.status_code} - {res.text}")
#         return

#     # Parse the JSON response from the API
#     data = res.json()

#     # Filter relevant data (items and total)
#     filtered_data = []
#     for receipt in data.get("receipts", []):
#         for item in receipt.get("items", []):
#             filtered_data.append({
#                 "Description": item.get("description"),
#                 "Amount": item.get("amount")
#             })
#         # Add total amount
#         if "total" in receipt:
#             filtered_data.append({"Description": "Total", "Amount": receipt["total"]})

#     filtered_data.pop()

#     # Print filtered receipt data in dictionary format
#     receipt_dict = {item['Description']: item['Amount'] for item in filtered_data}
#     print(receipt_dict)

#     current_dateTime = datetime.now()
#     formatted_dateTime = current_dateTime.strftime("%Y%m%d_%H%M%S")
#     # Save the receipt data to a JSON file
#     with open(f"receipt_data_{formatted_dateTime}.json", "w", encoding="utf-8") as json_file:
#         json.dump(receipt_dict, json_file, ensure_ascii=False, indent=4)
#         print("Receipt data has been saved to 'receipt_data_{formatted_dateTime}.json'.")
 
# if __name__ == "__main__":
#     if len(sys.argv) > 1:  # Check if argument is provided
#         scan_receipt(sys.argv[1])  # Pass first argument to function
#     else:
#         print("Usage: python ReceiptScanner.py <file_name>")

import cv2
import numpy as np
from PIL import Image
import pytesseract
import os

# --- Configuration for Tesseract ---
# IMPORTANT: Replace with the actual path to your tesseract.exe if on Windows
# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# --- Preprocessing Parameters (Experiment with these!) ---
UPSCALING_FACTOR = 1.5
GAUSSIAN_BLUR_KERNEL = (5, 5)
ADAPTIVE_THRESH_BLOCK_SIZE = 31
ADAPTIVE_THRESH_C = 10
INVERT_COLORS_IF_NEEDED = True

# --- Tesseract OCR Parameters (Experiment with these!) ---
TESSERACT_OEM = 1
TESSERACT_PSM = 3
TESSERACT_LANG = 'nld+eng'

# --- Debugging Visuals ---
SHOW_PREPROCESSING_STEPS = False

def preprocess_image(image_path):
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not load image at {image_path}")
        return None

    if SHOW_PREPROCESSING_STEPS:
        cv2.imshow('0. Original Image', img)
        cv2.waitKey(1)

    if UPSCALING_FACTOR > 1.0:
        img = cv2.resize(img, None, fx=UPSCALING_FACTOR, fy=UPSCALING_FACTOR, interpolation=cv2.INTER_CUBIC)
        if SHOW_PREPROCESSING_STEPS:
            cv2.imshow(f'1. Upscaled by {UPSCALING_FACTOR}x', img)
            cv2.waitKey(1)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if SHOW_PREPROCESSING_STEPS:
        cv2.imshow('2. Grayscale', gray)
        cv2.waitKey(1)

    blurred = cv2.GaussianBlur(gray, GAUSSIAN_BLUR_KERNEL, 0)
    if SHOW_PREPROCESSING_STEPS:
        cv2.imshow(f'3. Blurred (Kernel {GAUSSIAN_BLUR_KERNEL})', blurred)
        cv2.waitKey(1)

    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY,
        ADAPTIVE_THRESH_BLOCK_SIZE, ADAPTIVE_THRESH_C
    )
    if SHOW_PREPROCESSING_STEPS:
        cv2.imshow(f'4. Adaptive Threshold (Block {ADAPTIVE_THRESH_BLOCK_SIZE}, C {ADAPTIVE_THRESH_C})', thresh)
        cv2.waitKey(1)

    if INVERT_COLORS_IF_NEEDED and np.mean(thresh) < 127:
        thresh = cv2.bitwise_not(thresh)
        if SHOW_PREPROCESSING_STEPS:
            cv2.imshow('5. Inverted Colors', thresh)
            cv2.waitKey(1)
    
    kernel = np.ones((1,1),np.uint8)
    dilated_eroded = cv2.dilate(thresh, kernel, iterations = 1)
    dilated_eroded = cv2.erode(dilated_eroded, kernel, iterations = 1)
    if SHOW_PREPROCESSING_STEPS:
        cv2.imshow('6. Dilated/Eroded', dilated_eroded)
        cv2.waitKey(1)

    return Image.fromarray(dilated_eroded)

def perform_ocr(image_pil):
    custom_config = f'--oem {TESSERACT_OEM} --psm {TESSERACT_PSM}'
    text = pytesseract.image_to_string(image_pil, lang=TESSERACT_LANG, config=custom_config)
    return text


# --- Main Execution Block ---
if __name__ == "__main__":
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
    else:
        print("Usage: python ReceiptScanner.py <image_path>")
        sys.exit(1)

    try:
        if not os.path.exists(image_path):
            print(f"Error: Image '{image_path}' not found. Please ensure the image is in the correct path.")
        else:
            print(f"Processing image: {image_path}")

            preprocessed_img_pil = preprocess_image(image_path)
            if preprocessed_img_pil is None:
                print("Image preprocessing failed. Exiting.")
            else:
                print("Performing OCR...")
                ocr_text = perform_ocr(preprocessed_img_pil)
                
                print("\n--- Raw OCR Text ---")
                product_section = ocr_text.split('\n')
                products_dict = {}
                print("\n--- Processed Product Section ---")
                processed_lines = []
                for line in product_section:
                    if line.startswith('i '):
                        line = '1 ' + line[2:]
                    
                    parts = line.split()
                    if len(parts) > 0 and parts[0].endswith('kg'):
                        # Rejoin from the second part onwards, effectively removing the 'X.XXXkg'
                        line = '1 ' + ' '.join(parts[1:])
                    
                    processed_lines.append(line)

                    if line.startswith('Prijs') or line == "" or line.startswith('BONUS BOX') or line.endswith('eSPAARZEGELS'):
                        # Remove the 'Prijs per kg' line
                        continue
                    
                    # if a line does not start with a digit remove it
                    if not line[0].isdigit() and not line.startswith('BONUS'):
                        continue

                    
                    # seperate the line into parts from first digit to a word to another number
                    parts = line.split()
                    name = ""
                    if len(parts) > 3: 
                        # If the second part is 'AH', we assume the first part is a number
                        name = parts[1] + ' ' + ' '.join(parts[2:-1])
                    else:
                        name = parts[1]
                    products_dict[name] = parts[-1]
                    
                 
                for product in products_dict:
                        print(f"{product}: {products_dict[product]}")

                
                
    except Exception as e:
        print(f"An unhandled error occurred during processing: {e}")
    finally:
        # This block is guaranteed to execute whether an error occurred or not,
        # ensuring that OpenCV windows are attempted to be closed.
        cv2.destroyAllWindows()
       