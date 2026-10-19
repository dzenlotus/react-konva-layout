import ReactDOM from 'react-dom';
import FreeSceneExample from '../../../src/examples/FreeSceneExample';
import CameraExample from '../../../src/examples/CameraExample';
import '../../../src/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Demo root element is missing.');

const Demo = new URLSearchParams(window.location.search).has('camera')
  ? CameraExample
  : FreeSceneExample;
ReactDOM.render(<Demo />, container);
