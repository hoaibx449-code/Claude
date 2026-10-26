import copy
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ink'))
from ink.shorts3d import validate


def example():
    return {'title':'Thử cảnh','hook':'Một bước nhỏ','palette':['#112233'],
            'shots':[{'say':'Bắt đầu một việc nhỏ.', 'objects':[{'shape':'box','position':[0,0,0]}]}]}


class Validation(unittest.TestCase):
    def test_does_not_execute_or_keep_ai_code_urls(self):
        data=example();data['code']='fetch("https://evil.test")';data['shots'][0]['url']='file:///etc/passwd'
        got=validate(data)
        self.assertNotIn('code',got);self.assertNotIn('url',got['shots'][0])

    def test_rejects_unknown_geometry_and_unbounded_object_counts(self):
        data=example();data['shots'][0]['objects'][0]['shape']='script'
        with self.assertRaises(ValueError):validate(data)
        data=example();data['shots'][0]['objects']*=25
        with self.assertRaises(ValueError):validate(data)

    def test_preserves_fact_checked_words_and_bounds_geometry(self):
        data=example();data['shots'][0]['objects'][0].update(position=[float('nan'),999,-999],scale=[0,999,1],color='url(evil)')
        got=validate(data,['Lời đã kiểm chứng.'])
        self.assertEqual(got['scenes'][0]['say'],'Lời đã kiểm chứng.')
        self.assertEqual(got['shots'][0]['objects'][0]['position'],[0,8,-8])
        self.assertEqual(got['shots'][0]['objects'][0]['scale'],[.1,5,1])
        self.assertEqual(validate(got)['world'],got['world'])

    def test_rejects_mismatched_narration(self):
        with self.assertRaises(ValueError):validate(example(),['a','b'])


if __name__=='__main__': unittest.main()
