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

def extract_products_from_receipt(image_path):
    """Extract product names and prices from a receipt image."""
    
    with open(image_path, "rb") as f:
        content = f.read()
    
    image = vision.Image(content=content)
    response = client.text_detection(image=image)
    
    # Check for errors
    if response.error.message:
        raise Exception(f'Vision API Error: {response.error.message}')
    
    print("Vision API response received, processing text...")
    
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

def write_products_to_json(products, output_path="extracted_products.json"):
    """Write extracted products to a JSON file."""
    
    # Filter out quantity-only patterns for JSON
    filtered_products = []
    for product_name, price in products:
        # Skip lines that are ONLY quantity/price patterns
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

# Main execution when run as script
if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python ocrtest.py <image_path>")
        print("Example: python ocrtest.py receipt.jpg")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    try:
        print(f"Starting OCR processing for: {image_path}")
        
        # Extract products from receipt
        products = extract_products_from_receipt(image_path)
        
        if not products:
            print("No products found in the image")
            sys.exit(1)
        
        # Write to JSON file
        receipt_data = write_products_to_json(products)
        
        print("\nProcessing complete!")
        print(f"Found {len(products)} products")
        print(f"Total amount: €{receipt_data['total_amount']:.2f}")
        
        # Display products
        print("\nExtracted Products:")
        print("-" * 40)
        for product, price in products:
            print(f"{product:<25} €{price:.2f}")
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)