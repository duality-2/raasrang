from PIL import Image

img = Image.open("public/ticket-bg.png")
width, height = img.size

purple_count = 0
total_count = 0
for y in range(int(height/2), height):
    for x in range(int(width/2)):
        r, g, b = img.getpixel((x, y))[:3]
        if abs(r - 43) < 20 and abs(g - 9) < 20 and abs(b - 56) < 20:  
            purple_count += 1
        total_count += 1

print(f"Purple pixels: {purple_count}/{total_count} ({purple_count/total_count*100:.2f}%)")
