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

def write_products_to_pdf(products, output_path="extracted_products.pdf"):
    """Write extracted products to a PDF file."""
    
    # Create PDF
    c = canvas.Canvas(output_path, pagesize=letter)
    width, height = letter
    
    # Set up the document
    c.setTitle("Extracted Receipt Products")
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "Receipt Products")
    
    # Draw a line under the title
    c.line(50, height - 70, width - 50, height - 70)
    
    # Set font for content
    c.setFont("Helvetica", 12)
    
    # Calculate totals
    total_price = sum(price for _, price in products)
    
    # Write products
    y_position = height - 100
    for product, price in products:
        if y_position < 100:  # Start new page if needed
            c.showPage()
            c.setFont("Helvetica", 12)
            y_position = height - 50
        
        # Draw product name on the left
        c.drawString(50, y_position, product)
        
        # Draw price aligned to the right margin
        price_text = f"€{price:.2f}"
        price_width = c.stringWidth(price_text, "Helvetica", 12)
        c.drawString(width - 50 - price_width, y_position, price_text)
        
        y_position -= 20
    
    # Add total
    if y_position < 80:
        c.showPage()
        y_position = height - 50
    
    c.line(50, y_position - 10, width - 50, y_position - 10)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y_position - 30, "TOTAL:")
    
    # Draw total amount aligned to the right
    total_text = f"€{total_price:.2f}"
    total_width = c.stringWidth(total_text, "Helvetica-Bold", 12)
    c.drawString(width - 50 - total_width, y_position - 30, total_text)
    
    # Add footer
    c.setFont("Helvetica", 8)
    c.drawString(50, 30, f"Generated from receipt OCR - {len(products)} items found")
    
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

if __name__ == "__main__":
    # Check if image path is provided as command line argument
    if len(sys.argv) != 2:
        print("Usage: python receipt_parser.py <image_path>")
        print("Example: python receipt_parser.py simple.jpg")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    try:
        products = extract_products_from_receipt(image_path, client)
        print("Extracted products:")
        for product, price in products:
            print(f"  {product}: €{price:.2f}")
        
        # Write to PDF and JSON
        if products:
            write_products_to_pdf(products)
            write_products_to_json(products)
            print(f"\nTotal items: {len(products)}")
            print(f"Total amount: €{sum(price for _, price in products):.2f}")
        else:
            print("No products found to write to PDF or JSON.")
            
    except FileNotFoundError:
        print(f"Error: Image file '{image_path}' not found.")
    except Exception as e:
        print(f"Error processing receipt: {e}")