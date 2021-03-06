import expect from 'expect';
import jsdomReact from './jsdomReact';
import React, { PropTypes, Component } from 'react/addons';
import { createStore, combineReducers } from 'redux';
import { Connector } from '../../src/index';

const { TestUtils } = React.addons;

describe('React', () => {
  describe('Connector', () => {
    jsdomReact();

    // Mock minimal Provider interface
    class Provider extends Component {
      static childContextTypes = {
        store: PropTypes.object.isRequired
      }

      getChildContext() {
        return { store: this.props.store };
      }

      render() {
        return this.props.children();
      }
    }

    function stringBuilder(prev = '', action) {
      return action.type === 'APPEND'
        ? prev + action.body
        : prev;
    }

    it('should receive the store in the context', () => {
      const store = createStore(combineReducers({}));

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          {() => (
            <Connector>
              {() => <div />}
            </Connector>
          )}
        </Provider>
      );

      const connector = TestUtils.findRenderedComponentWithType(tree, Connector);
      expect(connector.context.store).toBe(store);
    });

    it('should subscribe to the store changes', () => {
      const reducer = combineReducers({string: stringBuilder});
      const store = createStore(reducer);

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          {() => (
            <Connector slicer={state => ({ string: state.string })}>
              {({ string }) => <div string={string} />}
            </Connector>
          )}
        </Provider>
      );

      const div = TestUtils.findRenderedDOMComponentWithTag(tree, 'div');
      expect(div.props.string).toBe('');
      store.dispatch({ type: 'APPEND', body: 'a'});
      expect(div.props.string).toBe('a');
      store.dispatch({ type: 'APPEND', body: 'b'});
      expect(div.props.string).toBe('ab');
    });

    it('should unsubscribe before unmounting', () => {
      const reducer = combineReducers({string: stringBuilder});
      const store = createStore(reducer);
      const subscribe = store.subscribe;

      // Keep track of unsubscribe by wrapping subscribe()
      const spy = expect.createSpy(() => {});
      store.subscribe = (listener) => {
        const unsubscribe = subscribe(listener);
        return () => {
          spy();
          return unsubscribe();
        };
      };

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          {() => (
            <Connector slicer={state => ({ string: state.string })}>
              {({ string }) => <div string={string} />}
            </Connector>
          )}
        </Provider>
      );

      const connector = TestUtils.findRenderedComponentWithType(tree, Connector);
      expect(spy.calls.length).toBe(0);
      connector.componentWillUnmount();
      expect(spy.calls.length).toBe(1);
    });

    it('should shallowly compare the selected state to prevent unnecessary updates', () => {
      const reducer = combineReducers({string: stringBuilder});
      const store = createStore(reducer);
      const spy = expect.createSpy(() => {});
      function render({ string }) {
        spy();
        return <div string={string}/>;
      }

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          {() => (
            <Connector slicer={state => ({ string: state.string })}>
              {render}
            </Connector>
          )}
        </Provider>
      );

      const div = TestUtils.findRenderedDOMComponentWithTag(tree, 'div');
      expect(spy.calls.length).toBe(1);
      expect(div.props.string).toBe('');
      store.dispatch({ type: 'APPEND', body: 'a'});
      expect(spy.calls.length).toBe(2);
      store.dispatch({ type: 'APPEND', body: 'b'});
      expect(spy.calls.length).toBe(3);
      store.dispatch({ type: 'APPEND', body: ''});
      expect(spy.calls.length).toBe(3);
    });

    it('should recompute the state slice when the select prop changes', () => {
      const store = createStore(combineReducers({
        a: () => 42,
        b: () => 72
      }));

      function selectA(state) {
        return { result: state.a };
      }

      function selectB(state) {
        return { result: state.b };
      }

      function render({ result }) {
        return <div>{result}</div>;
      }

      class Container extends Component {
        constructor() {
          super();
          this.state = { slicer: selectA };
        }

        render() {
          return (
            <Provider store={store}>
              {() =>
                <Connector slicer={this.state.slicer}>
                  {render}
                </Connector>
              }
            </Provider>
          );
        }
      }

      let tree = TestUtils.renderIntoDocument(<Container />);
      let div = TestUtils.findRenderedDOMComponentWithTag(tree, 'div');
      expect(div.props.children).toBe(42);

      tree.setState({ slicer: selectB });
      expect(div.props.children).toBe(72);
    });

    it('should pass dispatch() to the child function', () => {
      const store = createStore(combineReducers({}));

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          {() => (
            <Connector>
              {({ dispatch }) => <div dispatch={dispatch} />}
            </Connector>
          )}
        </Provider>
      );

      const div = TestUtils.findRenderedDOMComponentWithTag(tree, 'div');
      expect(div.props.dispatch).toBe(store.dispatch);
    });

    it('should throw an error if select returns anything but a plain object', () => {
      const store = createStore(combineReducers({}));

      expect(() => {
        TestUtils.renderIntoDocument(
          <Provider store={store}>
            {() => (
              <Connector slicer={() => 1}>
                {() => <div />}
              </Connector>
            )}
          </Provider>
        );
      }).toThrow(/slicer/);

      expect(() => {
        TestUtils.renderIntoDocument(
          <Provider store={store}>
            {() => (
              <Connector slicer={() => 'hey'}>
                {() => <div />}
              </Connector>
            )}
          </Provider>
        );
      }).toThrow(/slicer/);

      function AwesomeMap() { }

      expect(() => {
        TestUtils.renderIntoDocument(
          <Provider store={store}>
            {() => (
              <Connector slicer={() => new AwesomeMap()}>
                {() => <div />}
              </Connector>
            )}
          </Provider>
        );
      }).toThrow(/slicer/);
    });

    it('should not setState when renderToString is called on the server', () => {
      const { renderToString } = React;
      const reducer = combineReducers({string: stringBuilder});
      const store = createStore(reducer);

      class TestComp extends Component {
        componentWillMount() {
          store.dispatch({
            type: 'APPEND',
            body: 'a'
          });
        }

        render() {
          return <div>{this.props.string}</div>;
        }
      }

      const el = (
        <Provider store={store}>
          {() => (
            <Connector slicer={state => ({ string: state.string })}>
              {({ string }) => <TestComp string={string} />}
            </Connector>
          )}
        </Provider>
      );

      expect(() => renderToString(el)).toNotThrow();
    });

    it('should handle dispatch inside componentDidMount', () => {
      const reducer = combineReducers({string: stringBuilder});
      const store = createStore(reducer);

      class TestComp extends Component {
        componentDidMount() {
          store.dispatch({
            type: 'APPEND',
            body: 'a'
          });
        }

        render() {
          return <div>{this.props.string}</div>;
        }
      }

      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          {() => (
            <Connector slicer={state => ({ string: state.string })}>
              {({ string }) => <TestComp string={string} />}
            </Connector>
          )}
        </Provider>
      );

      const testComp = TestUtils.findRenderedComponentWithType(tree, TestComp);
      expect(testComp.props.string).toBe('a');
    });
  });
});
