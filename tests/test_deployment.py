import json, os, subprocess, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
class Deployment(unittest.TestCase):
    def test_owner_confirmed_public_issuer_and_explicit_override(self):
        args=self.model()['services']['synkro-sales-portal']['build']['args']
        self.assertEqual(args['VITE_ISSUER_LEGAL_NAME'],'synkro tech sas')
        self.assertEqual(args['VITE_ISSUER_TAX_ID'],'803.256.942-7')
        overridden=self.model(VITE_ISSUER_LEGAL_NAME='VEN19 TEST FIXTURE',VITE_ISSUER_TAX_ID='TEST-VEN19-NOT-FISCAL')['services']['synkro-sales-portal']['build']['args']
        self.assertEqual(overridden['VITE_ISSUER_LEGAL_NAME'],'VEN19 TEST FIXTURE')
        self.assertEqual(overridden['VITE_ISSUER_TAX_ID'],'TEST-VEN19-NOT-FISCAL')
    def model(self, **values):
        env = dict(os.environ)
        env.pop('VITE_BASE_PATH', None)
        env.update(values)
        return json.loads(subprocess.check_output(['docker','compose','-f',str(ROOT/'deploy/compose.yml'),'config','--format','json'],env=env,text=True))
    def test_internal_platform_root_delivery(self):
        model=self.model()
        service=model['services']['synkro-sales-portal']
        self.assertFalse(service.get('ports'))
        self.assertEqual(service['expose'], ['80'])
        self.assertIn('platform',service['networks'])
        self.assertTrue(model['networks']['platform']['external'])
        self.assertEqual(Path(service['build']['context']).resolve(),ROOT)
        self.assertEqual(service['build']['args']['VITE_BASE_PATH'],'/remotes/sales/')
        self.assertEqual(service['build']['args']['VITE_SHELL_ENTRY_URL'],'http://localhost:5173/assets/remoteEntry.js')
        # Required issuer values use owner-confirmed public defaults; optional contacts remain absent.
        for name in ('VITE_ISSUER_ADDRESS','VITE_ISSUER_PHONE','VITE_ISSUER_EMAIL'):
            self.assertEqual(service['build']['args'][name],'')
        self.assertEqual(service['environment']['HOST_ORIGIN'],'http://localhost:5173')
        self.assertFalse(service.get('secrets'))
        self.assertFalse(service.get('volumes'))
    def test_standalone_base_can_be_selected_without_internal_browser_dns(self):
        service=self.model(VITE_BASE_PATH='/',VITE_SHELL_ENTRY_URL='https://host.example/assets/remoteEntry.js',HOST_ORIGIN='https://host.example')['services']['synkro-sales-portal']
        self.assertEqual(service['build']['args']['VITE_BASE_PATH'],'/')
        self.assertEqual(service['build']['args']['VITE_SHELL_ENTRY_URL'],'https://host.example/assets/remoteEntry.js')
        self.assertEqual(service['environment']['HOST_ORIGIN'],'https://host.example')
if __name__=='__main__': unittest.main()
