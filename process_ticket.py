import fitz
import sys
from PIL import Image, ImageDraw

doc = fitz.open("/Users/rishabhh/Downloads/PASS DESIGN _20261007_122814_0000.pdf")
page = doc.load_page(0)
# Use a high dpi like 300
pix = page.get_pixmap(dpi=300)
pix.save("public/ticket-bg-highres.png")

img = Image.open("public/ticket-bg-highres.png")
print(f"Dimensions: {img.size}")
