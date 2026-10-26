"""The drawing library as data for the website (catalog.json): the objects a scene can draw, with a short Vietnamese
name, so a user editing a scene picks from what the engine really knows. Regenerate after changing props.py:
    python -m ink.catalog"""
import json, os
from .props import PROPS

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'catalog.json')


def build():
    # the description starts with Vietnamese words: the first two and the key make the name ("đồng hồ (clock)")
    return {'props': [[k, f"{' '.join(d.split()[:2])} ({k})"] for k, (_, d) in PROPS.items()]}


if __name__ == '__main__':
    json.dump(build(), open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(PATH)
