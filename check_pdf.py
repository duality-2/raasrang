import fitz
doc = fitz.open("/Users/rishabhh/Downloads/PASS DESIGN _20261007_122814_0000.pdf")
page = doc.load_page(0)
print(page.rect)
