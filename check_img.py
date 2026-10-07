from PIL import Image

img = Image.open("public/ticket-bg.png")
print("Mode:", img.mode)

# Check if there is transparency
if img.mode == 'RGBA':
    extrema = img.getextrema()
    print("Alpha extrema:", extrema[3])
