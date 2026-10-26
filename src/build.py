import base64,json,urllib.parse
tok=open("TOKEN.txt").read().strip()
ic=base64.b64encode(open("icon-180.png","rb").read()).decode()
ic512=base64.b64encode(open("icon-512.png","rb").read()).decode()
man={"name":"100K Trail Ladder","short_name":"100K Trail","display":"standalone","background_color":"#F4EEDF","theme_color":"#F4EEDF","icons":[{"src":"data:image/png;base64,"+ic512,"sizes":"512x512","type":"image/png"}]}
manu="data:application/manifest+json,"+urllib.parse.quote(json.dumps(man))
h=open("template.html").read().replace("__TOPIC__",tok).replace("__ICON180__","data:image/png;base64,"+ic).replace("__MANIFEST__",manu)
import os;os.makedirs("dist",exist_ok=True);open("dist/index.html","w").write(h);print(len(h))
