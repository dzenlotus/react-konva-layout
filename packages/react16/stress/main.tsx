import ReactDOM from 'react-dom';
import FreeNodesExample from '../../../src/examples/FreeNodesExample';
import '../../../src/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Demo root element is missing.');

ReactDOM.render(<FreeNodesExample />, container);
