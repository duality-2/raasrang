import fitz

doc = fitz.open("/Users/rishabhh/Downloads/PASS DESIGN _20261007_122814_0000.pdf")
for page_index in range(len(doc)):
    page = doc[page_index]
    image_list = page.get_images(full=True)
    if image_list:
        print(f"[+] Found a total of {len(image_list)} images in page {page_index}")
    else:
        print("[!] No images found on page", page_index)
    for image_index, img in enumerate(image_list, start=1):
        xref = img[0]
        base_image = doc.extract_image(xref)
        image_bytes = base_image["image"]
        image_ext = base_image["ext"]
        image_name = f"public/extracted_image_{page_index}_{image_index}.{image_ext}"
        with open(image_name, "wb") as f:
            f.write(image_bytes)
            print(f"[+] Image saved as {image_name}")
