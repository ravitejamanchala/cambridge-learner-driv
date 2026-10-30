import importlib.util,pathlib,tempfile,json,unittest
import numpy as np
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('propose',root/'tools/vision/propose.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class VisionTests(unittest.TestCase):
 def test_bounds_and_rights(self):
  m={'source':{'provider':'Original synthetic fixture','license':'CC0','attribution':'SlayDrive test geometry','capturedAt':'2026-10-30','allowsDerivedData':True},'crs':'EPSG:4326','northUpOrthophoto':True,'bounds':[.1,52,.101,52.001]}
  self.assertEqual(mod.validate_manifest(m),m);m['northUpOrthophoto']=False
  with self.assertRaises(ValueError):mod.validate_manifest(m)
 def test_vectorization_holes_and_georeferencing(self):
  p=np.zeros((100,100),dtype=float);p[10:80,10:80]=.8;p[30:50,30:50]=0
  f=mod.vectorize({'yellow_box':p},{'bounds':[.1,52,.101,52.001]},100,100,.6)
  self.assertEqual(len(f),1);self.assertEqual(len(f[0]['geometry']['coordinates']),2)
  for r in f[0]['geometry']['coordinates']:
   self.assertEqual(r[0],r[-1]);self.assertTrue(all(.1<=x<=.101 and 52<=y<=52.001 for x,y in r))
  self.assertFalse(f[0]['properties']['verified']);self.assertFalse(f[0]['properties']['scoreCalibrated'])
if __name__=='__main__':unittest.main()
