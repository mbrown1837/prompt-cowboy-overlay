import sys
import os
import json
import threading
import time
import ctypes
from ctypes import wintypes
import webview
import pystray
from PIL import Image, ImageDraw

# App Configuration
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".prompt_cowboy_overlay_config.json")
DEFAULT_URL = "https://www.promptcowboy.ai/30c09323-e446-4b58-9e85-7077bf9b9547/prompt/7e6d840c-3cc7-43f5-938c-7c4453fa8d40"

print("Imports successful! Testing core modules...")
