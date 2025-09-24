import os
from google.cloud import vision
import re
from collections import defaultdict
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter 
import sys
import json
import tempfile
from datetime import datetime
from google.oauth2 import service_account

# Handle Google Cloud credentials from environment variable
def create_vision_client():
    """Create Vision API client with proper credentials handling"""
    credentials_json = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    
    if credentials_json:
        try:
            # Parse the JSON credentials
            credentials_dict = json.loads(credentials_json)
            
            # Create credentials from the dictionary
            credentials = service_account.Credentials.from_service_account_info(
                credentials_dict,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            
            # Create client with explicit credentials
            return vision.ImageAnnotatorClient(credentials=credentials)
        except json.JSONDecodeError as e:
            print(f"Error parsing credentials JSON: {e}")
            return None
        except Exception as e:
            print(f"Error creating Vision client from JSON credentials: {e}")
            return None
    else:
        print("No GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable found")
        return None

# Clear any existing GOOGLE_APPLICATION_CREDENTIALS to avoid conflicts
if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
    del os.environ['GOOGLE_APPLICATION_CREDENTIALS']

# Create client
client = create_vision_client()
if not client:
    print("Failed to create Vision API client")
    sys.exit(1)

def extract_products_from_receipt(image_path, client):
    """Extract product names and prices from a receipt image."""
    
    with open(image_path, "rb") as f:
        content = f.read()
    
    image = vision.Image(content=content)
    response = client.text_detection(image=image)
    
    # Check for errors
    if response.error.message:
        raise Exception(f'Error: {response.error.message}')
    
    # Regex for prices (handles negative prices, commas/dots as decimal separators)
    price_pattern = re.compile(r"-?\d+[.,]\d{1,2}")
    
    # Keywords to ignore (receipt totals, taxes, etc.)
    ignore_keywords = {
        "totaal", "betaald", "korting", "btw", "subtotal", "change", 
        "wisselgeld", "pinnen", "emballage", "box", "voordeel", "total", 
        "bankpas", "cash", "eur", " kg"
    }
    
    # Extract words with their y-coordinates for line grouping
    words = []
    for annotation in response.text_annotations[1:]:  # Skip full text at index 0
        vertices = annotation.bounding_poly.vertices
        avg_y = sum(vertex.y for vertex in vertices) / len(vertices)
        words.append((annotation.description, avg_y))
    
    # Group words into lines based on y-coordinate
    lines_dict = defaultdict(list)
    tolerance = 15  # Pixel tolerance for grouping words into lines
    
    # Sort words by y-coordinate first, then x-coordinate
    sorted_words = sorted(words, key=lambda w: w[1])
    
    for word, y in sorted_words:
        # Find existing line within tolerance or create new one
        placed = False
        for line_y in lines_dict:
            if abs(line_y - y) < tolerance:
                lines_dict[line_y].append(word)
                placed = True
                break
        
        if not placed:
            lines_dict[y].append(word)
    
    # Convert to sorted lines of text
    lines = []
    for line_y in sorted(lines_dict.keys()):
        line_text = " ".join(lines_dict[line_y])
        lines.append(line_text)
    
    # Extract products and prices
    products = []
    
    for line in lines:
        # Skip lines with ignore keywords
        if any(keyword in line.lower() for keyword in ignore_keywords):
            continue
        
        # Find price in line
        price_match = price_pattern.search(line)
        if not price_match:
            continue
        
        # Extract price and normalize decimal separator
        price_str = price_match.group().replace(",", ".")
        
        try:
            price = float(price_str)
        except ValueError:
            continue
        
        # Extract product name (everything except the price)
        tokens = line.split()
        price_token = price_match.group()
        
        # Remove price token from line to get product name
        product_tokens = [token for token in tokens if token != price_token]
        if product_tokens:
            # Sort the words in the product name alphabetically
            sorted_tokens = sorted(product_tokens, key=str.lower)
            product_name = " ".join(sorted_tokens).strip()
        else:
            product_name = ""
        
        if product_name:
            products.append((product_name, price))
    
    return products

def write_products_to_pdf(products_with_split, person_names, person_totals, output_path="extracted_split_receipt.pdf"):
    """
    Writes extracted products, their amounts, the split weights, and the final 
    person totals to a PDF file.

    Args:
        products_with_split (list): A list of tuples: (product_name, price, [weights])
        person_names (list): A list of strings for person headers (e.g., ["Person 1", "Person 2"])
        person_totals (list): A list of final amounts owed by each person (e.g., [15.90, 10.30, ...])
        output_path (str): The path to save the PDF.
    """
    
    # --- PDF Setup ---
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter
    
    # Column positions
    # Product Name starts at 50
    # Price starts at 400
    # Weights columns start from 470
    x_product = 50
    x_price = 400
    x_weights_start = 470
    x_weights_step = 30 
    
    # --- Title and Header ---
    c.setTitle("Split Receipt Summary")
    c.setFont("Helvetica-Bold", 16)
    c.drawString(x_product, height - 50, "Detailed Split Receipt")
    
    # Draw a line under the title
    c.line(x_product, height - 70, width - x_product, height - 70)
    
    # --- Column Headers ---
    c.setFont("Helvetica-Bold", 10)
    y_position = height - 90
    
    # Product and Amount header
    c.drawString(x_product, y_position, "Product")
    c.drawString(x_price, y_position, "Amount")
    
    # Weights headers (P1, P2, P3, P4)
    x = x_weights_start
    for name in person_names:
        # Use only the number (1, 2, 3, 4) for the column header
        c.drawString(x, y_position, name.split()[-1]) 
        x += x_weights_step
        
    # Line under headers
    y_position -= 5
    c.line(x_product, y_position, width - x_product, y_position)
    y_position -= 15
    
    # --- Product Details and Splits ---
    total_price = 0
    c.setFont("Helvetica", 9)
    
    for product, price, weights in products_with_split:
        total_price += price
        
        if y_position < 100:  # Start new page if needed
            c.showPage()
            c.setFont("Helvetica-Bold", 10)
            y_position = height - 50
            
            # Redraw headers on new page
            c.drawString(x_product, y_position, "Product")
            c.drawString(x_price, y_position, "Amount")
            x = x_weights_start
            for name in person_names:
                c.drawString(x, y_position, name.split()[-1])
                x += x_weights_step
            
            y_position -= 5
            c.line(x_product, y_position, width - x_product, y_position)
            y_position -= 15
            c.setFont("Helvetica", 9)
        
        # Draw product name (left-aligned)
        c.drawString(x_product, y_position, product)
        
        # Draw price (right-aligned in its column)
        price_text = f"€{price:.2f}"
        price_width = c.stringWidth(price_text, "Helvetica", 9)
        c.drawString(x_price + 30 - price_width, y_position, price_text) 
        
        # Draw weights (centered in their columns)
        x = x_weights_start
        for weight in weights:
            # Ensure weight is treated as an integer for display
            weight = int(weight)
            weight_text = str(weight) if weight > 0 else ""
            
            # Center the text within the 30-unit column space
            weight_width = c.stringWidth(weight_text, "Helvetica", 9)
            c.drawString(x + (x_weights_step / 2) - (weight_width / 2), y_position, weight_text)
            x += x_weights_step
            
        y_position -= 12 # Less space for product lines
    
    # --- Final Totals Section ---
    if y_position < 100:
        c.showPage()
        y_position = height - 50
    
    y_position -= 20
    c.line(x_product, y_position - 10, width - x_product, y_position - 10)
    y_position -= 30
    
    # Draw Grand Total
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x_product, y_position, "GRAND TOTAL:")
    
    total_text = f"€{total_price:.2f}"
    total_width = c.stringWidth(total_text, "Helvetica-Bold", 12)
    c.drawString(x_price + 30 - total_width, y_position, total_text)
    
    y_position -= 30
    c.setFont("Helvetica-Bold", 14)
    c.drawString(x_product, y_position, "Person Split Totals")
    y_position -= 20
    c.setFont("Helvetica-Bold", 12)
    
    # Draw Split Totals
    for i, (name, total) in enumerate(zip(person_names, person_totals)):
        if y_position < 30: # Check if a new page is needed for totals
            c.showPage()
            y_position = height - 50
            c.setFont("Helvetica-Bold", 12)
        
        person_text = f"{name}:"
        total_text = f"€{total:.2f}"
        
        c.drawString(x_product, y_position, person_text)
        
        # Align total amount with the original price column
        total_width = c.stringWidth(total_text, "Helvetica-Bold", 12)
        c.drawString(x_price + 30 - total_width, y_position, total_text)
        
        y_position -= 20
        
    # Add footer
    c.setFont("Helvetica", 8)
    c.drawString(50, 30, f"Generated from receipt OCR and Splitter App - {len(products_with_split)} items found")
    
    c.save()
    print(f"PDF saved to: {output_path}")

def write_products_to_json(products, output_path="extracted_products.json"):
    """Write extracted products to a JSON file."""
    
    # Filter out quantity-only patterns for JSON
    filtered_products = []
    for product_name, price in products:
        # Skip lines that are ONLY quantity/price patterns (e.g., "3 X 3,87", "2 X 1,16")
        is_only_quantity = bool(re.match(r'^\s*\d+\s*[xX×*]\s*\d*[.,]?\d*\s*$', product_name))
        is_only_numbers = bool(re.match(r'^\s*\d+\s*$', product_name))
        
        # Only include if it's NOT a quantity pattern or just numbers
        if not is_only_quantity and not is_only_numbers:
            filtered_products.append({"product": product_name, "price": price})
    
    # Calculate totals from filtered products only
    total_price = sum(item["price"] for item in filtered_products)
    
    # Create JSON structure
    receipt_data = {
        "timestamp": datetime.now().isoformat(),
        "total_items": len(filtered_products),
        "total_amount": round(total_price, 2),
        "currency": "EUR",
        "products": filtered_products
    }
    
    # Write to JSON file
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(receipt_data, f, indent=2, ensure_ascii=False)
    
    print(f"JSON saved to: {output_path}")
    print(f"Filtered out {len(products) - len(filtered_products)} quantity-only lines")
    
    return receipt_data

