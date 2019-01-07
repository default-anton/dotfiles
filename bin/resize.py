#!/usr/bin/env python3

from subprocess import Popen, PIPE
import re

cmd = "xdpyinfo | grep dimensions"
out, err = Popen(cmd, stdout=PIPE, shell=True).communicate()
res = out.decode("utf-8")
screen_dimension = re.findall(r'(\d+x\d+) pixels', res)[0]
width, height = screen_dimension.split("x")
width, height = int(width), int(height)
new_width = int(0.7 * width)
start_pos_x = int((width - new_width) / 2)

print(f"wmctrl -r :ACTIVE: -b remove,fullscreen && wmctrl -r :ACTIVE: -b remove,maximized_vert,maximized_horz && wmctrl -r :ACTIVE: -e 0,{start_pos_x},0,{new_width},{height}")
