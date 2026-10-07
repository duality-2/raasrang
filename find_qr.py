from PIL import Image

img = Image.open("public/ticket-bg-highres.png")
pixels = img.load()
width, height = img.size

# Search in the right side
x_start = int(width * 0.75)
x_end = width
y_start = 0
y_end = height

white_pixels = []

for x in range(x_start, x_end):
    for y in range(y_start, y_end):
        r, g, b = pixels[x, y][:3]
        if r > 240 and g > 240 and b > 240:
            white_pixels.append((x, y))

if white_pixels:
    min_x = min(p[0] for p in white_pixels)
    max_x = max(p[0] for p in white_pixels)
    min_y = min(p[1] for p in white_pixels)
    max_y = max(p[1] for p in white_pixels)
    print(f"White bounding box:")
    print(f"min_x: {min_x}, max_x: {max_x}, min_y: {min_y}, max_y: {max_y}")
    
    print(f"leftPercent: {min_x / width * 100:.2f}%")
    print(f"topPercent: {min_y / height * 100:.2f}%")
    print(f"widthPercent: {(max_x - min_x) / width * 100:.2f}%")
    print(f"heightPercent: {(max_y - min_y) / height * 100:.2f}%")
else:
    print("No white pixels found on the right side.")

