import copy
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ink'))
from ink.shorts3d import validate, fit_times, composition_ok, compose_chunk


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

    def test_voice_retiming_scales_scenes_and_captions_together(self):
        spans,words=fit_times([(0,0,66),(1,66,132)],[(1,'kết',120,132)],120/132,120)
        self.assertEqual(spans,[(0,0,60),(1,60,120)])
        self.assertEqual(words[-1][-1],120)

    def test_composition_refuses_a_single_primitive_disguised_as_a_scene(self):
        with self.assertRaises(ValueError):composition_ok(validate(example()))
        data=example();data['shots'][0]['objects']*=3
        self.assertEqual(len(composition_ok(validate(data))['shots'][0]['objects']),3)

    def test_multi_sentence_scene_is_not_split_and_repair_gets_actual_error(self):
        import json
        calls=[]
        bad=example();good=example();good['shots'][0]['objects']*=3
        def ask(system,user,check,log):
            calls.append(json.loads(user))
            if len(calls)==1:
                try:check(bad)
                except ValueError:raise RuntimeError('models exhausted')
            check(good);return good
        with patch('ink.shorts3d.ai.ask',side_effect=ask):
            got=compose_chunk('system',['Câu một. Câu hai.'],{'context':'Một cảnh khác.'},log=lambda _:None)
        self.assertEqual(calls[0]['shot_count'],1)
        self.assertEqual(calls[0]['lines_to_visualize'],['Câu một. Câu hai.'])
        self.assertIn('3 bộ phận',calls[1]['repair']['error'])
        self.assertEqual(got['shots'][0]['say'],'Câu một. Câu hai.')


if __name__=='__main__': unittest.main()
