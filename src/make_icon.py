from PIL import Image, ImageDraw, ImageFont
S=540
im=Image.new("RGB",(S,S),"#F4EEDF");d=ImageDraw.Draw(im)
d.ellipse((330,70,450,190),fill="#E8772E")
d.polygon([(0,430),(150,190),(240,300),(330,150),(540,430)],fill="#3B5B85")
d.polygon([(0,540),(0,400),(120,300),(260,420),(400,330),(540,420),(540,540)],fill="#7C9A4E")
try: f=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",120)
except: f=ImageFont.load_default()
d.text((S/2,470),"100K",fill="#F4EEDF",font=f,anchor="mm")
im.resize((180,180),Image.LANCZOS).save("icon-180.png");im.resize((512,512),Image.LANCZOS).save("icon-512.png")
