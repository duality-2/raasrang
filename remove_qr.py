from PIL import Image, ImageDraw

img = Image.open("public/ticket-bg-highres.png")
draw = ImageDraw.Draw(img)

# Sample color from just above the white box
bg_color = img.getpixel((2112, 450))

# Fill the white box region with the background color
draw.rectangle([2110, 455, 2416, 762], fill=bg_color)

# Resize to something reasonable but high-res, e.g. 3200x1035 or keep original
img = img.resize((3200, int(3200 * (825/2550))), Image.LANCZOS)
img.save("public/ticket-bg.png")

print(f"Removed QR and saved as ticket-bg.png with size {img.size}")
