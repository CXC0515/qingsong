var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../../Projects/qingsong/node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "../../../../Projects/qingsong/node_modules/react/cjs/react.development.js"(exports, module) {
    "use strict";
    (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                null != _ioInfo && (_ioInfo.end = performance.now());
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now());
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            ioInfo.value = thenable;
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module && module[requireString]).call(
              module,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports.Activity = REACT_ACTIVITY_TYPE;
      exports.Children = fnName;
      exports.Component = Component;
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.Profiler = REACT_PROFILER_TYPE;
      exports.PureComponent = PureComponent;
      exports.StrictMode = REACT_STRICT_MODE_TYPE;
      exports.Suspense = REACT_SUSPENSE_TYPE;
      exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports.__COMPILER_RUNTIME = deprecatedAPIs;
      exports.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports.cacheSignal = function() {
        return null;
      };
      exports.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key = 2; key < arguments.length; key++)
          validateChildKeys(arguments[key]);
        return props;
      };
      exports.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        i = {};
        var key = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          key,
          i,
          getOwner(),
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports.isValidElement = isValidElement;
      exports.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports.useId = function() {
        return resolveDispatcher().useId();
      };
      exports.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports.version = "19.2.7";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// ../../../../Projects/qingsong/node_modules/react/index.js
var require_react = __commonJS({
  "../../../../Projects/qingsong/node_modules/react/index.js"(exports, module) {
    "use strict";
    if (false) {
      module.exports = null;
    } else {
      module.exports = require_react_development();
    }
  }
});

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/createLucideIcon.js
var import_react2 = __toESM(require_react());

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
};

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/Icon.js
var import_react = __toESM(require_react());

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/Icon.js
var Icon = (0, import_react.forwardRef)(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => (0, import_react.createElement)(
    "svg",
    {
      ref,
      ...defaultAttributes,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: mergeClasses("lucide", className),
      ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
      ...rest
    },
    [
      ...iconNode.map(([tag, attrs]) => (0, import_react.createElement)(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = (0, import_react2.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react2.createElement)(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

// ../../../../Projects/qingsong/node_modules/lucide-react/dist/esm/icons/settings.js
var __iconNode = [
  [
    "path",
    {
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      key: "1i5ecw"
    }
  ],
  ["circle", { cx: "12", cy: "12", r: "3", key: "1v7zrd" }]
];
var Settings = createLucideIcon("settings", __iconNode);

// src/components/glass/runtime/native-backdrop.js
var NS = "http://www.w3.org/2000/svg";
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function field(x, y, w, h, radius, band, strength) {
  const r = Math.min(radius, w / 2, h / 2);
  const px = x - w / 2, py = y - h / 2;
  const qx = Math.abs(px) - w / 2 + r, qy = Math.abs(py) - h / 2 + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
  const sd = Math.min(Math.max(qx, qy), 0) + len - r;
  let nx = 0, ny = 0;
  if (len > 0) {
    nx = ox / len * Math.sign(px);
    ny = oy / len * Math.sign(py);
  } else if (qx > qy) nx = Math.sign(px);
  else ny = Math.sign(py);
  const t = clamp(1 + sd / Math.max(band, 1), 0, 1);
  const edge = t * t * (3 - 2 * t);
  return { dx: -nx * edge * strength, dy: -ny * edge * strength, sd, edge };
}
var NativeBackdrop = class {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.options = { radius: 52, band: 26, strength: 20, blur: 0, dispersion: 0, ...options };
    this.id = "glass-" + Math.random().toString(36).slice(2);
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("width", "0");
    this.svg.setAttribute("height", "0");
    this.svg.style.cssText = "position:absolute;pointer-events:none";
    this.svg.innerHTML = `<defs><filter id="${this.id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage result="map" preserveAspectRatio="none"/><feComponentTransfer in="map" result="neutralMap"><feFuncR type="linear" slope="1" intercept="${-0.5 / 255}"/><feFuncG type="linear" slope="1" intercept="${-0.5 / 255}"/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="neutralMap" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
    document.body.append(this.svg);
    this.filter = this.svg.querySelector("filter");
    this.image = this.svg.querySelector("feImage");
    this.displacement = this.svg.querySelector("feDisplacementMap");
    this.displacement.setAttribute("result", "plain");
    const matrix = [
      "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
      "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
      "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0"
    ];
    this.channels = matrix.map((values, i) => {
      const shift = document.createElementNS(NS, "feDisplacementMap");
      for (const [k, v] of Object.entries({ in: "SourceGraphic", in2: "neutralMap", xChannelSelector: "R", yChannelSelector: "G", result: "shift" + i })) shift.setAttribute(k, v);
      const color = document.createElementNS(NS, "feColorMatrix");
      for (const [k, v] of Object.entries({ in: "shift" + i, type: "matrix", values, result: "channel" + i })) color.setAttribute(k, v);
      this.filter.append(shift, color);
      return shift;
    });
    const rg = document.createElementNS(NS, "feBlend");
    for (const [k, v] of Object.entries({ in: "channel0", in2: "channel1", mode: "screen", result: "rg" })) rg.setAttribute(k, v);
    this.filter.append(rg);
    this.combine = document.createElementNS(NS, "feBlend");
    for (const [k, v] of Object.entries({ in: "rg", in2: "channel2", mode: "screen" })) this.combine.setAttribute(k, v);
    this.filter.append(this.combine);
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(layer);
    this.render();
  }
  set(options) {
    Object.assign(this.options, options);
    this.render();
  }
  render() {
    const w = parseFloat(getComputedStyle(this.layer).width), h = parseFloat(getComputedStyle(this.layer).height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || !w || !h) return;
    const { radius, band, strength, blur, dispersion } = this.options;
    const dpr = Math.min(devicePixelRatio || 1, 2), iw = Math.ceil(w * dpr), ih = Math.ceil(h * dpr);
    const key = [w, h, radius, band, strength, blur, dispersion, dpr].join(",");
    if (this.cacheKey === key) return;
    this.cacheKey = key;
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext("2d"), data = ctx.createImageData(iw, ih), mask = ctx.createImageData(iw, ih);
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const f = field((x + 0.5) * w / iw, (y + 0.5) * h / ih, w, h, radius, band, 1);
      const i = (y * iw + x) * 4;
      data.data[i] = Math.round(128 + f.dx * 127);
      data.data[i + 1] = Math.round(128 + f.dy * 127);
      data.data[i + 2] = 128;
      data.data[i + 3] = 255;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = 255;
      mask.data[i + 3] = f.sd <= 0 ? Math.round(Math.min(1, f.edge * 8) * 255) : 0;
    }
    ctx.putImageData(data, 0, 0);
    this.mapURL = c.toDataURL();
    ctx.putImageData(mask, 0, 0);
    const maskImage = blur ? "none" : `url(${c.toDataURL()})`;
    this.layer.style.maskImage = maskImage;
    this.layer.style.webkitMaskImage = maskImage;
    this.layer.style.maskSize = "100% 100%";
    this.layer.style.webkitMaskSize = "100% 100%";
    const pad = Math.ceil(strength + dispersion + blur * 3 + 2);
    for (const [k, v] of Object.entries({ x: -pad, y: -pad, width: w + pad * 2, height: h + pad * 2 })) this.filter.setAttribute(k, v);
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: w, height: h, href: this.mapURL })) this.image.setAttribute(k, v);
    this.displacement.setAttribute("scale", strength * 255 / 127);
    this.channels.forEach((channel, i) => channel.setAttribute("scale", Math.max(0, strength + (i - 1) * dispersion) * 255 / 127));
    this.combine.setAttribute("in", dispersion ? "rg" : "plain");
    this.combine.setAttribute("in2", dispersion ? "channel2" : "plain");
    this.combine.setAttribute("mode", dispersion ? "screen" : "normal");
    this.layer.style.backdropFilter = `url(#${this.id})${blur ? ` blur(${blur}px)` : ""}`;
    this.layer.style.webkitBackdropFilter = this.layer.style.backdropFilter;
  }
  destroy() {
    this.observer.disconnect();
    this.svg.remove();
    this.layer.style.backdropFilter = "";
    this.layer.style.webkitBackdropFilter = "";
    this.layer.style.maskImage = "";
    this.layer.style.webkitMaskImage = "";
  }
};

// src/components/glass/runtime/edge-light.js
var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
var EdgeLight = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cacheKey = "";
  }
  configure(width, height, radius, rimWidth) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(width * dpr), h = Math.round(height * dpr);
    const r = Math.min(radius, width / 2, height / 2), key = [width, height, r, rimWidth, dpr].join(",");
    if (key === this.cacheKey || !w || !h) return;
    this.cacheKey = key;
    this.canvas.width = w;
    this.canvas.height = h;
    this.image = this.ctx.createImageData(w, h);
    this.edge = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = (x + 0.5) / dpr - width / 2, py = (y + 0.5) / dpr - height / 2;
      const qx = Math.abs(px) - width / 2 + r, qy = Math.abs(py) - height / 2 + r, ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
      const d = -(Math.min(Math.max(qx, qy), 0) + len - r);
      if (d < 0 || d > 5) continue;
      const nx = len ? ox / len * Math.sign(px) : qx > qy ? Math.sign(px) : 0, ny = len ? oy / len * Math.sign(py) : qy >= qx ? Math.sign(py) : 0;
      const core = Math.exp(-Math.pow((d - 0.65) / rimWidth, 2) * 2.6), spread = Math.exp(-Math.pow(d / 2.1, 2) * 1.5), i = (y * w + x) * 4;
      this.image.data[i] = 250;
      this.image.data[i + 1] = 253;
      this.image.data[i + 2] = 242;
      this.edge.push({ i, nx, ny, core, spread });
    }
  }
  draw(angle, reflection, theme) {
    if (!this.image) return;
    const a = angle * Math.PI / 180, lx = Math.cos(a), ly = Math.sin(a), gain = reflection * (theme === "dark" ? 0.86 : 1);
    for (const e of this.edge) {
      const facing = e.nx * lx + e.ny * ly, primary = Math.pow(Math.max(0, facing), 3), bounce = Math.pow(Math.max(0, -facing), 5);
      const shine = (e.core * (0.025 + 0.68 * primary + 0.13 * bounce) + e.spread * 0.075 * primary) * gain;
      this.image.data[e.i + 3] = Math.round(clamp2(shine, 0, 0.8) * 255);
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
};
var ChromaticRim = class extends EdgeLight {
  draw(angle, intensity, theme) {
    if (!this.image) return;
    const light = angle * Math.PI / 180;
    for (const e of this.edge) {
      const a = Math.atan2(e.ny, e.nx), curvature = Math.pow(Math.abs(2 * e.nx * e.ny), 0.65);
      const facing = Math.max(0, Math.cos(a - light));
      const spectrum = [0, 2.094, 4.189].map((phase) => Math.round(255 * (0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.cos(a * 2.5 + phase), 2))));
      this.image.data[e.i] = spectrum[0];
      this.image.data[e.i + 1] = spectrum[1];
      this.image.data[e.i + 2] = spectrum[2];
      this.image.data[e.i + 3] = Math.round(255 * clamp2((e.core * 0.65 + e.spread * 0.1) * curvature * (0.45 + 0.55 * facing) * intensity / 2, 0, 0.65));
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
};

// src/components/glass/runtime/config.js
var defaults = Object.freeze({
  preset: "lens",
  theme: "light",
  lightAngle: 225,
  reflection: 0.8,
  dispersion: 0,
  refraction: true,
  nativeRefraction: true,
  motion: Object.freeze({ mode: "static", periodMs: 16e3 })
});
var presets = Object.freeze({
  lens: Object.freeze({ radius: 48, edgeWidth: 23, displacement: 16, blur: 0, rimWidth: 1.15 }),
  button: Object.freeze({ radius: 26, edgeWidth: 11, displacement: 6, blur: 1.25, rimWidth: 0.85 }),
  segmented: Object.freeze({ radius: 27, edgeWidth: 11, displacement: 6, blur: 1.25, rimWidth: 0.85 }),
  toolbar: Object.freeze({ radius: 28, edgeWidth: 12, displacement: 7, blur: 1.25, rimWidth: 0.85 })
});

// src/components/glass/runtime/liquid-glass.js
var active = /* @__PURE__ */ new WeakMap();
var clamp3 = (n, a, b) => Math.max(a, Math.min(b, n));
function normalize(input) {
  if (!presets[input.preset]) throw new TypeError("Unknown glass preset");
  if (!["light", "dark"].includes(input.theme)) throw new TypeError("theme must be light or dark");
  if (!["static", "orbit"].includes(input.motion.mode)) throw new TypeError("motion.mode must be static or orbit");
  const c = { ...presets[input.preset], ...input, motion: { ...input.motion } };
  for (const key of ["radius", "edgeWidth", "displacement", "blur", "rimWidth", "lightAngle", "reflection", "dispersion"]) if (!Number.isFinite(c[key])) throw new TypeError(key + " must be finite");
  c.radius = Math.max(0, c.radius);
  c.edgeWidth = Math.max(1, c.edgeWidth);
  c.displacement = Math.max(0, c.displacement);
  c.blur = Math.max(0, c.blur);
  c.rimWidth = Math.max(0.1, c.rimWidth);
  c.dispersion = clamp3(c.dispersion, 0, 5);
  c.reflection = clamp3(c.reflection, 0, 1);
  c.lightAngle = (c.lightAngle % 360 + 360) % 360;
  if (!Number.isFinite(c.motion.periodMs) || c.motion.periodMs < 1e3) throw new TypeError("motion.periodMs must be at least 1000");
  return c;
}
function mountGlass(host, options = {}) {
  if (active.has(host)) throw new Error("Glass already mounted on this element");
  const existing = host.querySelector(":scope > .lg-content");
  if (!existing) throw new Error("Provide one direct .lg-content child; business content stays outside filter layers");
  let input = { ...defaults, ...options, motion: { ...defaults.motion, ...options.motion } }, config = normalize(input);
  const saved = { class: host.getAttribute("class"), style: host.getAttribute("style"), theme: host.getAttribute("data-lg-theme"), profile: host.getAttribute("data-lg-profile"), fallback: host.getAttribute("data-lg-fallback") };
  const layer = document.createElement("div");
  layer.className = "lg-backdrop";
  layer.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.className = "lg-light";
  canvas.setAttribute("aria-hidden", "true");
  const prism = document.createElement("canvas");
  prism.className = "lg-light lg-prism";
  prism.setAttribute("aria-hidden", "true");
  host.prepend(layer, canvas, prism);
  host.classList.add("lg-surface");
  const light = new EdgeLight(canvas), spectral = new ChromaticRim(prism);
  let native = null, raf = 0, visible = true, destroyed = false, lastTime = 0, phase = 0, lastDraw = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function draw() {
    light.draw(config.lightAngle + phase, config.reflection, config.theme);
    spectral.draw(config.lightAngle + phase, config.dispersion, config.theme);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
  }
  function frame(t) {
    if (destroyed) return;
    if (lastTime) phase = (phase + (t - lastTime) * 360 / config.motion.periodMs) % 360;
    lastTime = t;
    if (t - lastDraw >= 1e3 / 30) {
      draw();
      lastDraw = t;
    }
    raf = requestAnimationFrame(frame);
  }
  function reconcile() {
    stop();
    if (config.motion.mode === "orbit" && !reduced.matches && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else {
      if (reduced.matches || config.motion.mode === "static") phase = 0;
      draw();
    }
  }
  function geometry() {
    if (destroyed) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    host.style.setProperty("--lg-radius", Math.min(config.radius, w / 2, h / 2) + "px");
    host.style.setProperty("--lg-blur", config.blur + "px");
    light.configure(w, h, config.radius, config.rimWidth);
    spectral.configure(w, h, config.radius, config.rimWidth);
    draw();
  }
  function material() {
    host.dataset.lgTheme = config.theme;
    host.dataset.lgProfile = config.blur === 0 ? "clear" : "control";
    const nativeOptions = { radius: config.radius, band: config.edgeWidth, strength: config.refraction ? config.displacement : 0, blur: config.blur, dispersion: config.refraction ? config.dispersion : 0 };
    const enabled = config.nativeRefraction && "backdropFilter" in layer.style;
    host.dataset.lgFallback = String(!enabled);
    if (enabled) {
      if (native) native.set(nativeOptions);
      else native = new NativeBackdrop(layer, nativeOptions);
    } else {
      if (native) {
        native.destroy();
        native = null;
      }
      layer.style.backdropFilter = `blur(${config.blur}px)`;
      layer.style.webkitBackdropFilter = layer.style.backdropFilter;
    }
    geometry();
  }
  const observer = new ResizeObserver(geometry);
  observer.observe(host);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    reconcile();
  });
  intersection.observe(host);
  reduced.addEventListener("change", reconcile);
  document.addEventListener("visibilitychange", reconcile);
  material();
  reconcile();
  const api = {
    update(patch) {
      if (destroyed) throw new Error("Glass was destroyed");
      const nextInput = { ...input, ...patch, motion: { ...input.motion, ...patch.motion } };
      const next = normalize(nextInput), optical = ["preset", "radius", "edgeWidth", "displacement", "blur", "rimWidth", "refraction", "nativeRefraction", "theme", "dispersion"].some((k) => next[k] !== config[k]);
      input = nextInput;
      config = next;
      if (patch.lightAngle !== void 0 || patch.motion?.mode === "static") phase = 0;
      if (optical) material();
      else draw();
      reconcile();
    },
    getConfig() {
      return { ...config, motion: { ...config.motion } };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      observer.disconnect();
      intersection.disconnect();
      reduced.removeEventListener("change", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      native?.destroy();
      layer.remove();
      canvas.remove();
      prism.remove();
      active.delete(host);
      for (const [key, attr] of Object.entries({ class: "class", style: "style", theme: "data-lg-theme", profile: "data-lg-profile", fallback: "data-lg-fallback" })) {
        if (saved[key] === null) host.removeAttribute(attr);
        else host.setAttribute(attr, saved[key]);
      }
    }
  };
  active.set(host, api);
  return api;
}

// src/components/glass/runtime/segmented.js
function mountSegmented(root, options = {}) {
  function motionConfig(input) {
    const c = { transition: "soft", durationMs: 380, response90Ms: 155, stretch: 0.045, bulge: 0.12, liftPx: 0, overshootPx: 0, ...input };
    if (!["soft", "slide"].includes(c.transition)) throw new TypeError("transition must be soft or slide");
    for (const k of ["durationMs", "response90Ms", "stretch", "bulge", "liftPx", "overshootPx"]) if (!Number.isFinite(c[k]) || c[k] < 0) throw new TypeError(k + " must be finite and nonnegative");
    return c;
  }
  let motion = motionConfig(Object.fromEntries(["transition", "durationMs", "response90Ms", "stretch", "bulge", "liftPx", "overshootPx"].filter((k) => options[k] !== void 0).map((k) => [k, options[k]])));
  const buttons = [...root.querySelectorAll("[data-value]")];
  if (!buttons.length) throw new Error("Provide buttons with unique data-value");
  const values = buttons.map((b) => b.dataset.value);
  if (new Set(values).size !== values.length) throw new Error("Segment values must be unique");
  let value = options.value ?? values[0];
  if (!values.includes(value)) throw new Error("Unknown segment value");
  const indicator = document.createElement("div");
  indicator.className = "lg-indicator";
  indicator.setAttribute("aria-hidden", "true");
  indicator.innerHTML = '<div class="lg-content"></div>';
  root.prepend(indicator);
  root.classList.add("lg-segmented");
  const saved = buttons.map((b) => ({ pressed: b.getAttribute("aria-pressed"), tab: b.getAttribute("tabindex") }));
  const material = mountGlass(indicator, { preset: "segmented", radius: 999, edgeWidth: 7, displacement: 3, blur: 0.7, dispersion: 1.35, ...options.glass });
  let rimConfig = { lightAngle: 225, reflection: 0.8, theme: "dark", ...options.glass };
  const rimCanvas = options.trackRim ? document.createElement("canvas") : null;
  const rim = rimCanvas ? new EdgeLight(rimCanvas) : null;
  if (rimCanvas) {
    rimCanvas.className = "lg-light lg-track-light";
    rimCanvas.setAttribute("aria-hidden", "true");
    root.prepend(rimCanvas);
    root.classList.add("lg-track-rim");
  }
  function drawRim() {
    if (rim) {
      rim.configure(root.clientWidth, root.clientHeight, 999, 1.05);
      rim.draw(rimConfig.lightAngle, rimConfig.reflection, rimConfig.theme);
    }
  }
  const prism = indicator.querySelector(".lg-prism");
  let prismAnimation = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let animation = null, destroyed = false, trajectory = null;
  function move(animate) {
    const button2 = buttons[values.indexOf(value)], rr = root.getBoundingClientRect(), br = button2.getBoundingClientRect();
    if (!rr.width || !br.width) return;
    const old = indicator.getBoundingClientRect(), x = br.left - rr.left - root.clientLeft, y = br.top - rr.top - root.clientTop;
    const fromWidth = old.width || br.width;
    const fromX = old.left - rr.left - root.clientLeft + (fromWidth - br.width) / 2;
    let initialVelocity = 0;
    if (animate && trajectory && animation?.playState === "running") {
      const t = Math.max(0, Number(animation.currentTime) || 0) / 1e3;
      const { a, v, w } = trajectory;
      initialVelocity = (v - w * (v + w * a) * t) * Math.exp(-w * t);
    }
    animation?.cancel();
    prismAnimation?.cancel();
    trajectory = null;
    indicator.style.width = br.width + "px";
    indicator.style.height = br.height + "px";
    indicator.style.top = y + "px";
    indicator.style.transform = `translateX(${x}px)`;
    buttons.forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.value === value));
      b.tabIndex = b.dataset.value === value ? 0 : -1;
    });
    if (animate && !reduce.matches && Math.abs(fromX - x) > 0.5) {
      const travel = x - fromX, duration = Math.max(motion.durationMs, motion.response90Ms * 2.5), T = Math.max(1e-3, duration / 1e3);
      const fromScaleY = old.height / br.height || 1;
      const bulge = motion.liftPx > 0 ? Math.max(motion.bulge, (root.clientHeight + 2 * motion.liftPx) / br.height - 1) : motion.bulge;
      const smooth = (t) => {
        const n = Math.max(0, Math.min(1, t));
        return n * n * (3 - 2 * n);
      };
      const w = 3.889 / Math.max(1e-3, motion.response90Ms / 1e3);
      const response = (t) => 1 - (1 + w * t) * Math.exp(-w * t), end = response(T);
      const frames = [], prismFrames = [];
      const a = fromX - x, v = motion.transition === "soft" ? initialVelocity : 0;
      trajectory = { a, v, w };
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, t = u * T, p = i === 40 ? 1 : response(t) / end;
        const shapeProgress = Math.min(1, t / Math.max(1e-3, motion.durationMs / 1e3));
        const tail = 1 - smooth((shapeProgress - 0.75) / 0.25);
        const shapeTime = shapeProgress * 0.26;
        const pulse = (1 - Math.exp(-180 * shapeTime)) * Math.exp(-15 * shapeTime) * Math.sin(2 * Math.PI * 4.2 * shapeTime) * tail;
        const stretch = shapeTime / 0.045 * Math.exp(1 - shapeTime / 0.045) * tail;
        const liquid = motion.transition === "soft";
        const sx = fromWidth / br.width + (1 - fromWidth / br.width) * p + (liquid ? motion.stretch * stretch : 0);
        const baseY = fromScaleY + (1 - fromScaleY) * p, wave = 2.1 * pulse;
        const sy = baseY + (liquid ? wave >= 0 ? Math.max(0, 1 + bulge - baseY) * Math.min(1, wave) : bulge * wave * 0.3 : 0);
        const over = Math.sign(travel) * motion.overshootPx * pulse;
        const position = i === 40 ? x : x + (a + (v + w * a) * t) * Math.exp(-w * t);
        prismFrames.push({ opacity: 0.3 + (liquid ? 0.7 * Math.min(1, Math.max(0, wave)) : 0), offset: u });
        frames.push({ transform: `translateX(${position + over}px) scale(${sx},${sy})`, offset: u });
      }
      animation = indicator.animate(frames, { duration, easing: "linear" });
      prismAnimation = prism?.animate(prismFrames, { duration, easing: "linear" });
    }
  }
  function select(next, { animate = true, notify = true } = {}) {
    if (destroyed) return;
    if (!values.includes(next)) throw new Error("Unknown segment value");
    if (next === value) return;
    value = next;
    move(animate);
    if (notify) options.onChange?.(value);
  }
  const click = (e) => {
    const b = e.target.closest("[data-value]");
    if (buttons.includes(b)) select(b.dataset.value);
  };
  const key = (e) => {
    const current2 = buttons.indexOf(e.target);
    if (current2 < 0) return;
    const direction = getComputedStyle(root).direction === "rtl" ? -1 : 1;
    let n = current2;
    if (e.key === "ArrowRight") n = (current2 + direction + buttons.length) % buttons.length;
    else if (e.key === "ArrowLeft") n = (current2 - direction + buttons.length) % buttons.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[n].focus();
    select(values[n]);
  };
  const reducedChanged = () => {
    if (reduce.matches) {
      animation?.cancel();
      move(false);
    }
  };
  root.addEventListener("click", click);
  root.addEventListener("keydown", key);
  reduce.addEventListener("change", reducedChanged);
  let geometryKey = "";
  const observer = new ResizeObserver(() => {
    const key2 = [root.clientWidth, root.clientHeight, ...buttons.flatMap((b) => [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight])].join(",");
    if (key2 !== geometryKey) {
      geometryKey = key2;
      drawRim();
      move(false);
    }
  });
  observer.observe(root);
  buttons.forEach((b) => observer.observe(b));
  move(false);
  return {
    select,
    getValue: () => value,
    updateGlass(patch) {
      material.update(patch);
      rimConfig = { ...rimConfig, ...patch };
      drawRim();
    },
    updateMotion(patch) {
      motion = motionConfig({ ...motion, ...patch });
      animation?.cancel();
      move(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      animation?.cancel();
      observer.disconnect();
      reduce.removeEventListener("change", reducedChanged);
      root.removeEventListener("click", click);
      root.removeEventListener("keydown", key);
      prismAnimation?.cancel();
      rimCanvas?.remove();
      if (rimCanvas) root.classList.remove("lg-track-rim");
      material.destroy();
      indicator.remove();
      root.classList.remove("lg-segmented");
      buttons.forEach((b, i) => {
        for (const [key2, attr] of [["pressed", "aria-pressed"], ["tab", "tabindex"]]) saved[i][key2] === null ? b.removeAttribute(attr) : b.setAttribute(attr, saved[i][key2]);
      });
    }
  };
}

// docs/prototypes/assistant-settings/main.js
var $ = (s) => document.querySelector(s);
var settingsSvg = __iconNode.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([key]) => key !== "key").map(([key, value]) => `${key}="${value}"`).join(" ")} />`).join("");
var paths = { settings: settingsSvg, "panel-left": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>', x: '<path d="m6 6 12 12M6 18 18 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', chevron: '<path d="m9 6 6 6-6 6"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', search: '<circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 4.5 4.5"/>', "arrow-up": '<path d="M12 19V5m-6 6 6-6 6 6"/>', sliders: '<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', rules: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>', memory: '<path d="M6 3h12v18l-6-4-6 4z"/>' };
var icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.settings}</svg>`;
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var materials = /* @__PURE__ */ new Map();
function disposeWithin(root) {
  for (const [host, api] of materials) {
    if (root.contains(host)) {
      api.destroy();
      materials.delete(host);
    }
  }
}
function hydrate(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute("data-icon");
  });
  root.querySelectorAll(".material").forEach((el) => {
    if (!materials.has(el)) materials.set(el, mountGlass(el, { preset: "button", radius: 16, theme: "light", lightAngle: 225, reflection: 1 }));
  });
}
var records = [
  { id: 1, kind: "rules", content: "\u6559\u6848\u5148\u5217\u6559\u5B66\u76EE\u6807\uFF0C\u518D\u5217\u6559\u5B66\u8FC7\u7A0B\uFF1B\u8BFE\u5802\u6D3B\u52A8\u7ED9\u51FA\u5177\u4F53\u7684\u6559\u5E08\u63D0\u95EE\u3002", status: "active", updated: "\u4ECA\u5929", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 2, kind: "rules", content: "\u56DE\u7B54\u5C3D\u91CF\u7B80\u6D01\uFF0C\u7528\u4E2D\u6587\u8BF4\u660E\uFF1B\u4E0D\u786E\u5B9A\u7684\u5B66\u751F\u60C5\u51B5\u5148\u67E5\u8BB0\u5F55\u3002", status: "active", updated: "\u6628\u5929", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 3, kind: "rules", content: "\u8BFE\u5802\u5EFA\u8BAE\u4F18\u5148\u8003\u8651\u56DB\u5341\u5206\u949F\u5185\u80FD\u591F\u5B8C\u6210\u7684\u5B89\u6392\u3002", status: "disabled", updated: "10\u670825\u65E5", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 4, kind: "memory", content: "\u8FD9\u5B66\u671F\u60F3\u91CD\u70B9\u6539\u5584\u8BFE\u5802\u8BA8\u8BBA\u7684\u53C2\u4E0E\u5EA6\u3002", status: "active", updated: "\u4ECA\u5929", source: "\u8BFE\u5802\u8BA8\u8BBA\u600E\u4E48\u7EC4\u7EC7 \xB7 \u4ECA\u5929", expiry: "" },
  { id: 5, kind: "memory", content: "\u5907\u8BFE\u65F6\u4E60\u60EF\u5148\u6574\u7406\u5355\u5143\u76EE\u6807\uFF0C\u518D\u5B89\u6392\u6BCF\u8282\u8BFE\u7684\u6D3B\u52A8\u3002", status: "active", updated: "\u6628\u5929", source: "\u5907\u8BFE\u601D\u8DEF \xB7 \u6628\u5929", expiry: "" },
  { id: 6, kind: "memory", content: "\u5E0C\u671B\u6BCF\u5468\u7559\u51FA\u4E00\u6B21\u8BFE\u540E\u53CD\u601D\u7684\u65F6\u95F4\u3002", status: "active", updated: "10\u670825\u65E5", source: "\u672C\u4EBA\u6DFB\u52A0", expiry: "" },
  { id: 7, kind: "memory", content: "\u4ECA\u540E\u7684\u8BFE\u5802\u8BA8\u8BBA\uFF0C\u4F18\u5148\u5C1D\u8BD5\u5148\u72EC\u7ACB\u601D\u8003\u3001\u518D\u5C0F\u7EC4\u4EA4\u6D41\u3002", status: "candidate", updated: "\u4ECA\u5929", source: "\u8BFE\u5802\u8BA8\u8BBA\u600E\u4E48\u7EC4\u7EC7 \xB7 \u4ECA\u5929", expiry: "" },
  { id: 8, kind: "memory", content: "\u5E0C\u671B\u6559\u6848\u4E2D\u7684\u8BFE\u5802\u6D3B\u52A8\u9644\u4E0A\u9884\u8BA1\u7528\u65F6\u3002", status: "candidate", updated: "\u6628\u5929", source: "\u4E03\u5E74\u7EA7\u7684\u5907\u8BFE\u601D\u8DEF \xB7 \u6628\u5929", expiry: "" }
];
var settingsArea = "conversation";
var generationDraft = { custom: false, temperature: 0.7 };
var section = "rules";
var memoryFilter = "work";
var query = "";
var current = null;
var initial = "";
var initialExpiry = "";
var toastTimer;
var confirmAction;
var metrics = { human: 70, auto: 90, score: 75 };
var content = $("#settings-content");
var button = (id, label, primary = false) => `<button id="${id}" class="material ${primary ? "primary" : ""}" type="button"><span class="lg-content">${label}</span></button>`;
function heading(title, description, action = "") {
  return `<header class="page-heading"><div><span class="eyebrow">${settingsArea === "general" ? "\u6559\u5B66\u4E1A\u52A1\u8BBE\u7F6E" : "AI \u52A9\u624B"}</span><h2>${title}</h2><p>${description}</p></div>${action}</header>`;
}
function toast(text) {
  clearTimeout(toastTimer);
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  toastTimer = setTimeout(() => $("#toast").hidden = true, 3200);
}
function renderLinks() {
  const data = settingsArea === "general" ? [["metrics", "sliders", "OCR \u4E0E\u8BC4\u5206"]] : [["rules", "rules", "\u5DE5\u4F5C\u65B9\u5F0F"], ["memory", "memory", "\u8BB0\u5FC6\u4E0E\u4E8B\u9879"], ["capabilities", "sliders", "\u6A21\u578B\u4E0E\u8FD0\u884C"]];
  $(".settings-nav h1").textContent = settingsArea === "general" ? "\u4E3B\u8BBE\u7F6E" : "\u4F1A\u8BDD\u8BBE\u7F6E";
  $(".settings-nav>.nav-caption").textContent = settingsArea === "general" ? "\u9752\u677E\u6559\u5E08" : "AI \u52A9\u624B";
  $(".nav-note").innerHTML = settingsArea === "general" ? "\u6559\u5B66\u4E1A\u52A1\u8BBE\u7F6E<br>\u6B64\u5904\u4EC5\u6F14\u793A OCR \u4E0E\u8BC4\u5206" : "\u4E2A\u4EBA\u89C4\u5219\u4E0E\u80CC\u666F\u8DE8\u4F1A\u8BDD\u751F\u6548<br>\u751F\u6210\u53C2\u6570\u53EF\u4EC5\u7528\u4E8E\u5F53\u524D\u4F1A\u8BDD";
  $("#settings-links").innerHTML = data.map(([id, i, label]) => `<button class="settings-link" data-section="${id}" ${section === id ? 'aria-current="page"' : ""}>${icon(i)}${label}</button>`).join("");
  $("#settings-links").querySelectorAll("button").forEach((b) => b.onclick = () => {
    section = b.dataset.section;
    query = "";
    renderSettings();
  });
}
function rows() {
  const selected = records.filter((r) => r.kind === section && r.status !== "deleted" && (section !== "memory" || (memoryFilter === "pending" ? r.status === "candidate" : r.status !== "candidate")) && r.content.includes(query));
  return selected.length ? selected.map((r) => `<button class="record-row" data-record="${r.id}" aria-label="\u67E5\u770B${esc(r.content)}"><span class="row-copy"><span class="row-title">${esc(r.content)}</span><span class="row-subtitle"><span class="row-status ${r.status === "candidate" ? "pending" : ""}">${{ active: "\u5DF2\u542F\u7528", disabled: "\u5DF2\u505C\u7528", candidate: "\u5F85\u786E\u8BA4" }[r.status]}</span><span>${r.updated}${r.source === "\u672C\u4EBA\u6DFB\u52A0" ? " \xB7 \u672C\u4EBA\u6DFB\u52A0" : ""}</span></span></span>${icon("chevron")}</button>`).join("") : '<p class="empty">\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8BB0\u5F55\u3002</p>';
}
function wireRows() {
  content.querySelectorAll("[data-record]").forEach((b) => b.onclick = () => openEntry(records.find((r) => r.id === Number(b.dataset.record))));
}
function renderSettings() {
  disposeWithin(content);
  renderLinks();
  if (section === "metrics") renderMetrics();
  else if (section === "capabilities") renderCapabilities();
  else if (section === "memory" && memoryFilter === "work") renderWork();
  else if (section === "rules") {
    content.innerHTML = heading("\u5DE5\u4F5C\u65B9\u5F0F", "\u4F60\u7684\u4E2A\u4EBA\u89C4\u5219\uFF0C\u4EE5\u53CA\u52A9\u624B\u9075\u5FAA\u7684\u65B9\u6CD5\u3002", button("new-entry", icon("plus") + "\u65B0\u589E", true)) + `<div class="row-list">${rows()}</div><p class="footnote">\u4E2A\u4EBA\u89C4\u5219\u7528\u4E8E\u4F60\u7684\u540E\u7EED\u5BF9\u8BDD\u3002\u5F53\u524D\u660E\u786E\u8981\u6C42\u4F18\u5148\uFF1B\u4E0D\u4F1A\u6539\u53D8\u7CFB\u7EDF\u6743\u9650\u3002</p><details class="disclosure"><summary>\u884C\u4E3A\u539F\u5219\u4E0E\u5904\u7406\u65B9\u6CD5</summary><p>\u8EAB\u4EFD\u4E0E\u804C\u8D23\uFF1A\u534F\u52A9\u6559\u5E08\u67E5\u8BE2\u8BB0\u5F55\u3001\u6574\u7406\u5DE5\u4F5C\u548C\u5F62\u6210\u5EFA\u8BAE\u3002</p><p>\u5148\u6838\u5BF9\u5BF9\u8C61\u548C\u4F9D\u636E\uFF0C\u8BF4\u660E\u4E0D\u786E\u5B9A\u6027\u3002\u4E1A\u52A1\u6210\u529F\u4EE5\u56DE\u6267\u4E3A\u51C6\uFF0C\u4E0D\u80FD\u9760\u804A\u5929\u6216\u65E7\u8BB0\u5FC6\u63A8\u65AD\u3002</p><p>\u65B9\u6CD5\u4E0E\u6280\u80FD\uFF1A\u5B57\u6BB5\u5B9A\u4F4D\u3001\u5DE5\u5177\u4F7F\u7528\u548C\u5904\u7406\u6D41\u7A0B\u7531\u7CFB\u7EDF\u7EF4\u62A4\u3002\u8FD9\u91CC\u62AB\u9732\u7ED3\u6784\uFF0C\u672A\u4FEE\u6539\u771F\u5B9E\u63D0\u793A\u8BCD\u6216 Skill\u3002</p><small>\u6765\u6E90\uFF1A\u7CFB\u7EDF\u8BBE\u8BA1 \xB7 \u6559\u5E08\u4E2A\u4EBA\u89C4\u5219\u4E0D\u80FD\u8986\u76D6\u8FD9\u4E9B\u6743\u9650\u8FB9\u754C</small></details>`;
    $("#new-entry").onclick = () => openEntry(null);
  } else {
    const count = records.filter((r) => r.kind === "memory" && r.status === "candidate").length;
    content.innerHTML = heading("\u8BB0\u5FC6\u4E0E\u4E8B\u9879", "\u672A\u5B8C\u7684\u5DE5\u4F5C\u4E0E\u957F\u671F\u80CC\u666F\uFF0C\u5206\u522B\u4FDD\u5B58\u3002", button("new-entry", icon("plus") + "\u65B0\u589E", true)) + (count && memoryFilter === "saved" ? `<div class="review-line"><span>${count} \u6761\u8BB0\u5FC6\u5F85\u4F60\u786E\u8BA4</span><button id="review-pending">\u53BB\u67E5\u770B ${icon("chevron")}</button></div>` : "") + `<div class="memory-tools"><div class="segment-wrap"><div id="memory-segments"><button data-value="work">\u534F\u4F5C\u4E8B\u9879</button><button data-value="saved">\u957F\u671F\u80CC\u666F</button><button data-value="pending">\u5F85\u786E\u8BA4${count ? " \xB7 " + count : ""}</button></div></div><label class="search">${icon("search")}<input id="search-memory" type="search" aria-label="\u641C\u7D22\u8BB0\u5FC6" placeholder="\u641C\u7D22\u8BB0\u5FC6" value="${esc(query)}"></label></div><div class="row-list" id="memory-list">${rows()}</div><p class="footnote">\u53EA\u4FDD\u7559\u4F60\u5E0C\u671B\u52A9\u624B\u8BB0\u4F4F\u7684\u5185\u5BB9\u3002\u672A\u786E\u8BA4\u7684\u5EFA\u8BAE\u4E0D\u4F1A\u4F5C\u4E3A\u8BB0\u5FC6\u4F7F\u7528\u3002</p>`;
    const host = $("#memory-segments");
    materials.set(host, mountSegmented(host, { value: memoryFilter, trackRim: false, liftPx: 2, glass: { theme: "light", lightAngle: 225, reflection: 1 }, onChange: (value) => {
      memoryFilter = value;
      query = "";
      renderSettings();
    } }));
    $("#new-entry").onclick = () => openEntry(null);
    if ($("#review-pending")) $("#review-pending").onclick = () => {
      memoryFilter = "pending";
      renderSettings();
    };
    $("#search-memory").oninput = (e) => {
      query = e.target.value;
      $("#memory-list").innerHTML = rows();
      wireRows();
    };
  }
  hydrate(content);
  wireRows();
  if (section === "capabilities") wireGeneration();
}
function control(key, title, value, min, max, step = 1) {
  return `<div class="metric-control ${key === "score" ? "solo" : ""}"><label for="metric-${key}">${title}<output id="output-${key}" for="metric-${key}">${value}<small>%</small></output></label><input id="metric-${key}" type="range" value="${value}" min="${min}" max="${max}" step="${step}"></div>`;
}
function renderMetrics() {
  content.innerHTML = heading("OCR \u4E0E\u8BC4\u5206", "\u4FDD\u7559\u8BC6\u522B\u8D28\u91CF\u548C\u8BC4\u5206\u7F6E\u4FE1\u5EA6\u7684\u8C03\u8282\u5165\u53E3\u3002") + `<section class="metric-group"><h3>\u56FE\u50CF\u4E0E OCR \u8D28\u68C0</h3><p>\u8C03\u6574\u8BC6\u522B\u8D28\u91CF\u7684\u53C2\u8003\u9608\u503C\u3002</p><div class="metric-controls">${control("human", "\u4EBA\u5DE5\u590D\u6838\u9608\u503C", metrics.human, 50, 80, 5)}${control("auto", "\u81EA\u52A8\u901A\u8FC7\u9608\u503C", metrics.auto, 75, 98)}</div></section><section class="metric-group"><h3>AI \u8BC4\u5206\u7F6E\u4FE1\u5EA6</h3><p>\u67E5\u770B\u8BC4\u5206\u7ED3\u679C\u65F6\u4F7F\u7528\u7684\u7F6E\u4FE1\u5EA6\u53C2\u8003\u3002</p><div class="metric-controls">${control("score", "\u8BC4\u5206\u7F6E\u4FE1\u5EA6\u9608\u503C", metrics.score, 50, 95, 5)}</div></section><div class="metric-actions">${button("save-metrics", "\u4FDD\u5B58\u8BBE\u7F6E", true)}</div><p class="footnote">\u5F53\u524D\u6B63\u5F0F\u9875\u9762\u4F7F\u7528\u56FA\u5B9A\u9ED8\u8BA4\u503C\uFF1B\u8FD9\u4E9B\u8C03\u8282\u5C1A\u672A\u5B8C\u6574\u63A5\u901A\u5224\u5B9A\u6D41\u7A0B\u3002\u6B64\u5904\u53EA\u6A21\u62DF\u4FDD\u5B58\uFF0C\u4E0D\u6539\u53D8\u771F\u5B9E\u6279\u6539\u3002</p><details class="disclosure"><summary>\u6307\u6807\u542B\u4E49\u4E0E\u751F\u6548\u8303\u56F4</summary><p>\u4EBA\u5DE5\u590D\u6838\u4E0E\u81EA\u52A8\u901A\u8FC7\u9608\u503C\uFF1A\u62DF\u7528\u4E8E OCR \u8D28\u91CF\u5206\u6D41\uFF0C\u9700\u5148\u9A8C\u8BC1\u8D28\u91CF\u5206\u6570\u7684\u5B9A\u4E49\u53CA\u5176\u4E0E\u771F\u5B9E\u9519\u8BEF\u7684\u5173\u7CFB\u3002</p><p>\u8BC4\u5206\u7F6E\u4FE1\u5EA6\u9608\u503C\uFF1A\u62DF\u7528\u4E8E\u6807\u8BB0\u9700\u6559\u5E08\u6838\u5BF9\u7684\u7ED3\u679C\uFF1B\u4E0D\u5E94\u5C06\u6A21\u578B\u81EA\u8BC4\u76F4\u63A5\u5F53\u4F5C\u51C6\u786E\u7387\u3002</p><p>\u6B63\u5F0F\u63A5\u5165\u524D\u9700\u786E\u5B9A\u53C2\u6570\u5B58\u50A8\u3001\u5BF9\u54EA\u4E9B\u65B0\u4EFB\u52A1\u751F\u6548\uFF0C\u4EE5\u53CA\u5224\u5B9A\u670D\u52A1\u7684\u5B9E\u9645\u6D88\u8D39\u4F4D\u7F6E\u3002\u672A\u63A5\u5165\u524D\u4E0D\u663E\u793A\u201C\u5168\u5C40\u5DF2\u751F\u6548\u201D\u3002</p></details>`;
  for (const key of ["human", "auto", "score"]) $("#metric-" + key).oninput = (e) => {
    let value = Number(e.target.value);
    if (key === "human") value = Math.min(value, Number($("#metric-auto").value) - 5);
    if (key === "auto") value = Math.max(value, Number($("#metric-human").value) + 5);
    e.target.value = value;
    $("#output-" + key).innerHTML = value + "<small>%</small>";
  };
  $("#save-metrics").onclick = () => {
    for (const key of ["human", "auto", "score"]) metrics[key] = Number($("#metric-" + key).value);
    toast("\u6F14\u793A\uFF1A\u9608\u503C\u5DF2\u4FDD\u5B58\uFF0C\u672A\u6539\u53D8\u771F\u5B9E\u6279\u6539\u8BBE\u7F6E\u3002");
  };
}
function confirm(title, body, action, label = "\u786E\u8BA4") {
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-yes .lg-content").textContent = label;
  confirmAction = action;
  $("#confirm-dialog").showModal();
}
function dirty() {
  return $("#entry-content").value !== initial || $("#entry-expiry").value !== initialExpiry;
}
function closeEntry() {
  if (dirty()) confirm("\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF1F", "\u672C\u6B21\u586B\u5199\u5C1A\u672A\u4FDD\u5B58\u3002", () => $("#entry-dialog").close(), "\u653E\u5F03\u4FEE\u6539");
  else $("#entry-dialog").close();
}
function openEntry(record) {
  current = record;
  initial = record?.content ?? "";
  initialExpiry = record?.expiry ?? "";
  const kind = record?.kind ?? section;
  const pending = record?.status === "candidate";
  $("#dialog-category").textContent = kind === "rules" ? "\u4E2A\u4EBA\u89C4\u5219" : "\u957F\u671F\u8BB0\u5FC6";
  $("#dialog-title").textContent = pending ? "\u786E\u8BA4\u8FD9\u6761\u8BB0\u5FC6" : record ? "\u7F16\u8F91\u5185\u5BB9" : kind === "rules" ? "\u65B0\u589E\u4E2A\u4EBA\u89C4\u5219" : "\u65B0\u589E\u8BB0\u5FC6";
  $("#content-label").textContent = pending ? "\u62DF\u4FDD\u5B58\u7684\u5185\u5BB9" : "\u5185\u5BB9";
  $("#entry-content").value = initial;
  $("#entry-content").placeholder = kind === "rules" ? "\u4F8B\u5982\uFF1A\u6559\u6848\u5148\u5217\u6559\u5B66\u76EE\u6807\uFF0C\u518D\u5217\u6559\u5B66\u8FC7\u7A0B\u3002" : "\u4F8B\u5982\uFF1A\u8FD9\u5B66\u671F\u91CD\u70B9\u6539\u5584\u8BFE\u5802\u8BA8\u8BBA\u53C2\u4E0E\u5EA6\u3002";
  $("#entry-expiry").value = initialExpiry;
  $("#entry-meta").textContent = pending ? "\u786E\u8BA4\u524D\uFF0C\u4F60\u53EF\u4EE5\u5148\u8C03\u6574\u8FD9\u6BB5\u5185\u5BB9\u3002" : record ? "\u5F53\u524D" + (record.status === "active" ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528") + " \xB7 \u66F4\u65B0\u4E8E" + record.updated : "\u4FDD\u5B58\u540E\u7528\u4E8E\u540E\u7EED\u52A9\u624B\u8BF7\u6C42\u3002";
  $("#entry-source").textContent = "\u6765\u6E90\uFF1A" + (record?.source ?? "\u672C\u4EBA\u6DFB\u52A0");
  $("#save-entry .lg-content").textContent = pending ? "\u786E\u8BA4\u4FDD\u5B58" : record ? "\u4FDD\u5B58\u4FEE\u6539" : "\u4FDD\u5B58";
  $("#more-entry").hidden = !record;
  $("#more-menu").hidden = true;
  $("#more-entry").setAttribute("aria-expanded", "false");
  $("#toggle-entry").textContent = pending ? "\u6682\u4E0D\u4FDD\u5B58" : record?.status === "disabled" ? "\u542F\u7528\u8FD9\u6761\u8BB0\u5F55" : "\u505C\u7528\u8FD9\u6761\u8BB0\u5F55";
  $("#history-panel").hidden = true;
  $("#entry-dialog").querySelector("details").open = pending;
  $("#entry-dialog").showModal();
  hydrate($("#entry-dialog"));
}
$("#entry-form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("#entry-content").value.trim();
  if (!text) {
    $("#entry-content").focus();
    return;
  }
  const pending = current?.status === "candidate";
  if (current) {
    current.content = text;
    current.expiry = $("#entry-expiry").value;
    current.updated = "\u521A\u521A";
    if (pending) current.status = "active";
  } else records.push({ id: Date.now(), kind: section, content: text, expiry: $("#entry-expiry").value, status: "active", updated: "\u521A\u521A", source: "\u672C\u4EBA\u6DFB\u52A0" });
  $("#entry-dialog").close();
  renderSettings();
  toast(pending ? "\u6F14\u793A\uFF1A\u8BB0\u5FC6\u5DF2\u786E\u8BA4\u4FDD\u5B58\u3002" : "\u6F14\u793A\uFF1A\u5DF2\u4FDD\u5B58\uFF0C\u672A\u6539\u52A8\u771F\u5B9E\u8BB0\u5F55\u3002");
};
$("#close-entry").onclick = closeEntry;
$("#entry-dialog").oncancel = (e) => {
  e.preventDefault();
  closeEntry();
};
$("#more-entry").onclick = () => {
  $("#more-menu").hidden = !$("#more-menu").hidden;
  $("#more-entry").setAttribute("aria-expanded", String(!$("#more-menu").hidden));
};
$("#history-entry").onclick = () => {
  $("#history-panel").hidden = false;
  $("#history-panel").textContent = "\u4FEE\u6539\u8BB0\u5F55\u793A\u4F8B\uFF1A\u4ECA\u5929\u4FDD\u5B58\u5F53\u524D\u5185\u5BB9\u3002\u5B9E\u9645\u5E94\u7528\u4E2D\u5C06\u5728\u8FD9\u91CC\u67E5\u770B\u5386\u53F2\u7248\u672C\u548C\u539F\u59CB\u6765\u6E90\u3002";
  $("#more-menu").hidden = true;
};
$("#toggle-entry").onclick = () => {
  if (dirty()) {
    toast("\u8BF7\u5148\u4FDD\u5B58\u6216\u53D6\u6D88\u5F53\u524D\u4FEE\u6539\u3002");
    return;
  }
  if (current.status === "candidate") {
    confirm("\u6682\u4E0D\u4FDD\u5B58\u8FD9\u6761\u8BB0\u5FC6\uFF1F", "\u8FD9\u6761\u5EFA\u8BAE\u4E0D\u4F1A\u4F5C\u4E3A\u957F\u671F\u8BB0\u5FC6\u4F7F\u7528\u3002", () => {
      current.status = "deleted";
      $("#entry-dialog").close();
      renderSettings();
      toast("\u6F14\u793A\uFF1A\u5DF2\u5FFD\u7565\u8FD9\u6761\u5EFA\u8BAE\u3002");
    }, "\u6682\u4E0D\u4FDD\u5B58");
    return;
  }
  current.status = current.status === "active" ? "disabled" : "active";
  $("#entry-dialog").close();
  renderSettings();
  toast("\u6F14\u793A\uFF1A\u5DF2" + (current.status === "active" ? "\u542F\u7528" : "\u505C\u7528") + "\u3002");
};
$("#delete-entry").onclick = () => confirm("\u5220\u9664\u8FD9\u6761\u8BB0\u5F55\uFF1F", "\u540E\u7EED\u4E0D\u518D\u53EC\u56DE\u8FD9\u6761\u5185\u5BB9\uFF0C\u539F\u5BF9\u8BDD\u548C\u5386\u53F2\u7248\u672C\u4ECD\u4FDD\u7559\u3002", () => {
  current.status = "deleted";
  $("#entry-dialog").close();
  renderSettings();
  toast("\u6F14\u793A\uFF1A\u8BB0\u5F55\u5DF2\u5220\u9664\u3002");
}, "\u5220\u9664");
$("#confirm-cancel").onclick = () => $("#confirm-dialog").close();
$("#confirm-yes").onclick = () => {
  $("#confirm-dialog").close();
  confirmAction?.();
};
function scene(name) {
  const chat = name === "chat";
  if (!chat) {
    generationDraft = { ...activeDemo().generation ?? { custom: false, temperature: 0.7 } };
    settingsArea = name === "general" ? "general" : "conversation";
    if (settingsArea === "general") section = "metrics";
    else if (section === "metrics") section = "rules";
    renderSettings();
  }
  $("#settings-scene").hidden = chat;
  $("#chat-scene").hidden = !chat;
  $("#breadcrumb").textContent = chat ? "\u5DE5\u4F5C\u53F0 / AI \u52A9\u624B" : settingsArea === "general" ? "\u4E3B\u8BBE\u7F6E / OCR \u4E0E\u8BC4\u5206" : "AI \u52A9\u624B / \u4F1A\u8BDD\u8BBE\u7F6E";
  $("#return-chat").hidden = chat;
  document.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === name)));
}
document.querySelectorAll("[data-scene]").forEach((b) => b.onclick = () => scene(b.dataset.scene));
$("#return-chat").onclick = () => scene("chat");
$("#sidebar-settings").onclick = () => {
  section = "rules";
  renderSettings();
  scene("settings");
};
function collapse(value) {
  $("#chat-sidebar").hidden = value;
  $("#expand-sidebar").hidden = !value;
  $("#chat-scene").classList.toggle("sidebar-collapsed", value);
}
$("#collapse-sidebar").onclick = () => collapse(true);
$("#expand-sidebar").onclick = () => collapse(false);
$("#phone-toggle").onclick = () => {
  const enabled = $("#preview").classList.toggle("phone");
  $("#phone-toggle").setAttribute("aria-pressed", String(enabled));
  document.body.dataset.phone = String(enabled);
};
$("#send-demo").onclick = sendDemo;
$(".new-chat .lg-content").innerHTML = icon("plus") + "\u65B0\u5BF9\u8BDD";
function generationControls() {
  return `<section class="generation-controls"><div class="generation-title"><h3>\u6E29\u5EA6 <span>Temperature</span></h3><span class="status-pill">\u5F53\u524D\u4F1A\u8BDD \xB7 \u6F14\u793A</span></div><p>\u8F83\u4F4E\u65F6\u91C7\u6837\u66F4\u96C6\u4E2D\uFF1B\u8F83\u9AD8\u65F6\u56DE\u7B54\u53D8\u5316\u66F4\u5927\u3002\u6E29\u5EA6\u4E0D\u4EE3\u8868\u51C6\u786E\u7387\u3002</p><label class="inherit-control"><input id="inherit-temperature" type="checkbox" ${generationDraft.custom ? "" : "checked"}>\u8DDF\u968F\u6A21\u578B\u9ED8\u8BA4\u503C</label><div id="temperature-custom" ${generationDraft.custom ? "" : "hidden"}><label for="temperature-value">\u81EA\u5B9A\u4E49\u6E29\u5EA6 <output id="temperature-output">${generationDraft.temperature.toFixed(1)}</output></label><input id="temperature-value" type="range" min="0" max="2" step="0.1" value="${generationDraft.temperature}"><div class="range-captions"><span>\u91C7\u6837\u96C6\u4E2D</span><span>\u53D8\u5316\u66F4\u591A</span></div></div><p class="footnote">\u9ED8\u8BA4\u503C\u672A\u5728\u8FD9\u91CC\u5047\u5B9A\u30020\u20132 \u4EC5\u4E3A\u539F\u578B\u6F14\u793A\u8303\u56F4\uFF1B\u6B63\u5F0F\u63A7\u4EF6\u6309\u5177\u4F53\u6A21\u578B\u80FD\u529B\u8C03\u6574\uFF0C\u4E0D\u652F\u6301\u65F6\u8BF4\u660E\u539F\u56E0\u3002</p><div class="operation-actions">${button("save-generation", "\u4FDD\u5B58\u4F1A\u8BDD\u8BBE\u7F6E", true)}</div><p id="generation-feedback" role="status" class="footnote"></p></section>`;
}
function wireGeneration() {
  $("#inherit-temperature").onchange = (e) => {
    generationDraft.custom = !e.target.checked;
    $("#temperature-custom").hidden = !generationDraft.custom;
    $("#generation-feedback").textContent = "\u5C1A\u672A\u4FDD\u5B58\u7684\u6F14\u793A\u8BBE\u7F6E";
  };
  $("#temperature-value").oninput = (e) => {
    generationDraft.temperature = Number(e.target.value);
    $("#temperature-output").textContent = generationDraft.temperature.toFixed(1);
    $("#generation-feedback").textContent = "\u5C1A\u672A\u4FDD\u5B58\u7684\u6F14\u793A\u8BBE\u7F6E";
  };
  $("#save-generation").onclick = () => {
    activeDemo().generation = { ...generationDraft };
    $("#generation-feedback").textContent = generationDraft.custom ? "\u6F14\u793A\uFF1A\u5F53\u524D\u4F1A\u8BDD\u4ECE\u4E0B\u4E00\u6761\u65B0\u8BF7\u6C42\u4F7F\u7528\u6E29\u5EA6 " + generationDraft.temperature.toFixed(1) + "\uFF1B\u5DF2\u6709\u6D88\u606F\u4E0D\u53D8\u3002" : "\u6F14\u793A\uFF1A\u5F53\u524D\u4F1A\u8BDD\u8DDF\u968F\u6A21\u578B\u9ED8\u8BA4\u6E29\u5EA6\u3002";
    toast("\u4EC5\u4FDD\u5B58\u6F14\u793A\u8BBE\u7F6E\uFF0C\u672A\u6539\u53D8\u771F\u5B9E\u6A21\u578B\u8C03\u7528\u3002");
  };
}
var workItems = [
  { id: "follow", title: "\u8DDF\u8FDB\u5C0F\u6797\u7684\u4F5C\u4E1A\u8865\u4EA4", state: "\u5F85\u6838\u5BF9", detail: "\u4E0A\u6B21\u7EA6\u5B9A\uFF1A\u5468\u4E94\u6838\u5BF9\u8865\u4EA4\u60C5\u51B5\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u5B89\u6392\u8BFE\u540E\u6C9F\u901A\u3002", next: "\u91CD\u65B0\u8BFB\u53D6\u8BFE\u5802\u4EFB\u52A1\uFF0C\u786E\u8BA4\u5F53\u524D\u7ED3\u679C\u3002", source: "10 \u6708 26 \u65E5 \xB7 \u4F5C\u4E1A\u8DDF\u8FDB", ref: "\u4E03\u5E74\u7EA7\u4E00\u73ED \xB7 \u5468\u4E09\u9605\u8BFB\u68C0\u67E5" },
  { id: "discussion", title: "\u8C03\u6574\u4E0B\u5468\u8BFE\u5802\u8BA8\u8BBA", state: "\u5F85\u8865\u5145", detail: "\u5DF2\u9009\u201C\u5148\u72EC\u7ACB\u601D\u8003\uFF0C\u518D\u5C0F\u7EC4\u4EA4\u6D41\u201D\uFF0C\u5C1A\u672A\u786E\u5B9A\u8BFE\u6587\u4E0E\u5206\u7EC4\u65B9\u5F0F\u3002", next: "\u786E\u8BA4\u8BFE\u6587\u53CA\u8BFE\u5802\u65F6\u957F\u3002", source: "\u6628\u5929 \xB7 \u8BFE\u5802\u8BA8\u8BBA\u600E\u4E48\u7EC4\u7EC7", ref: "\u6559\u5B66\u65B9\u6848\u8349\u7A3F \xB7 \u5C1A\u672A\u5199\u5165\u65E5\u7A0B" }
];
var selectedWork = null;
function memorySegments() {
  return `<div class="memory-tabs" role="group" aria-label="\u8BB0\u5FC6\u5206\u7C7B">${[["work", "\u534F\u4F5C\u4E8B\u9879"], ["saved", "\u957F\u671F\u80CC\u666F"], ["pending", "\u5F85\u786E\u8BA4"]].map(([key, label]) => `<button data-memory-tab="${key}" aria-pressed="${memoryFilter === key}">${label}</button>`).join("")}</div>`;
}
function wireMemoryTabs() {
  content.querySelectorAll("[data-memory-tab]").forEach((b) => b.onclick = () => {
    memoryFilter = b.dataset.memoryTab;
    selectedWork = null;
    renderSettings();
  });
}
function renderWork() {
  content.innerHTML = heading("\u8BB0\u5FC6\u4E0E\u4E8B\u9879", "\u7EE7\u7EED\u672A\u5B8C\u7684\u5DE5\u4F5C\uFF0C\u67E5\u770B\u5DF2\u7ECF\u786E\u8BA4\u7684\u80CC\u666F\u3002") + memorySegments() + (selectedWork ? `<section class="work-detail"><button id="back-work" class="text-button">\u2039 \u8FD4\u56DE\u4E8B\u9879</button><span class="status-pill">${selectedWork.state}</span><h3>${selectedWork.title}</h3><p>${selectedWork.detail}</p><dl><dt>\u5173\u8054\u8BB0\u5F55</dt><dd>${selectedWork.ref}</dd><dt>\u4E0A\u6B21\u7EA6\u5B9A</dt><dd>${selectedWork.next}</dd><dt>\u6765\u6E90</dt><dd>${selectedWork.source}</dd></dl>${button("resume-work", "\u7EE7\u7EED\u8FD9\u4EF6\u4E8B", true)}<p class="footnote">\u7EE7\u7EED\u65F6\u91CD\u65B0\u67E5\u8BE2\u5F53\u524D\u4E1A\u52A1\u8BB0\u5F55\u3002\u65E7\u7EA6\u5B9A\u4E0D\u4F1A\u76F4\u63A5\u89E6\u53D1\u5199\u5165\u3002</p></section>` : `<div class="row-list">${workItems.map((w) => `<button class="record-row" data-work="${w.id}"><span class="row-copy"><span class="row-title">${w.title}</span><span class="row-subtitle"><span class="row-status">${w.state}</span><span>${w.source}</span></span><span class="work-next">${w.next}</span></span>${icon("chevron")}</button>`).join("")}</div><p class="footnote">\u4E8B\u9879\u4FDD\u5B58\u76EE\u6807\u3001\u7EA6\u5B9A\u548C\u4E0B\u4E00\u6B65\u3002\u5B66\u751F\u7ED3\u679C\u3001\u4EFB\u52A1\u8FDB\u5EA6\u4ECD\u4EE5\u4E1A\u52A1\u8BB0\u5F55\u4E3A\u51C6\u3002</p>`);
  wireMemoryTabs();
  content.querySelectorAll("[data-work]").forEach((b) => b.onclick = () => {
    selectedWork = workItems.find((w) => w.id === b.dataset.work);
    renderSettings();
  });
  if ($("#back-work")) $("#back-work").onclick = () => {
    selectedWork = null;
    renderSettings();
  };
  if ($("#resume-work")) $("#resume-work").onclick = () => {
    const follow = selectedWork.id === "follow";
    scene("chat");
    switchDemo(follow ? "follow" : "discussion", true);
    collapse(true);
    if (follow) {
      $("#chat-draft").value = "\u7EE7\u7EED\u8DDF\u8FDB\u5C0F\u6797\u7684\u4F5C\u4E1A\u8865\u4EA4\uFF0C\u5148\u6838\u5BF9\u73B0\u5728\u7684\u8BB0\u5F55\u3002";
      demoSessions.follow.draft = $("#chat-draft").value;
    } else {
      $("#chat-draft").value = "\u7EE7\u7EED\u8BA8\u8BBA\u65B9\u6848\uFF0C\u5148\u786E\u5B9A\u8BFE\u6587\u548C\u5206\u7EC4\u65B9\u5F0F\u3002";
      demoSessions.discussion.draft = $("#chat-draft").value;
    }
    $("#chat-draft").focus();
  };
}
function renderCapabilities() {
  content.innerHTML = heading("\u6A21\u578B\u4E0E\u8FD0\u884C", "\u8C03\u6574\u5F53\u524D\u4F1A\u8BDD\u7684\u751F\u6210\u65B9\u5F0F\uFF0C\u4E86\u89E3\u80FD\u529B\u4E0E\u8FD0\u884C\u8FB9\u754C\u3002") + generationControls() + `<section class="capability-block"><h3>\u53EF\u8BBF\u95EE\u7684\u6559\u5B66\u4FE1\u606F</h3><p>\u73ED\u7EA7\u4E0E\u540D\u5355\u3001\u8BFE\u8868\u3001\u8BFE\u5802\u4EFB\u52A1\u3001\u5EA7\u4F4D\u3001\u63D0\u9192\u53CA\u90E8\u5206\u5B66\u751F\u8BB0\u5F55\u3002</p><details class="disclosure"><summary>\u67E5\u770B\u6743\u9650\u4E0E\u5C1A\u672A\u5F00\u653E\u7684\u80FD\u529B</summary><p>\u5B66\u751F\u4E3B\u4F53\u53CA\u8EAB\u4EFD\u7531\u6559\u5E08\u624B\u52A8\u7EF4\u62A4\u3002\u8D44\u6599\u68C0\u7D22\u3001\u6279\u6539\u7ED3\u679C\u4E0E\u4E1A\u52A1\u5199\u5165\u5C1A\u672A\u63A5\u5165\u6B63\u5F0F\u52A9\u624B\u3002</p><p>\u8BFE\u5802\u7ED3\u679C\u5199\u5165\u3001\u52A8\u6001\u5B57\u6BB5\u66F4\u65B0\u3001\u8DE8\u4F1A\u8BDD\u4E8B\u9879\u5C5E\u4E8E\u672C\u6B21\u8BBE\u8BA1\u76EE\u6807\u3002\u539F\u578B\u91CC\u7684\u6210\u529F\u72B6\u6001\u4E0D\u4EE3\u8868\u5DF2\u4E0A\u7EBF\u3002</p></details></section><section class="capability-block"><h3>\u6A21\u578B\u4E0E\u751F\u6210\u53C2\u6570</h3><p>\u6A21\u578B\u53C2\u6570\u51B3\u5B9A\u751F\u6210\u65B9\u5F0F\uFF0COCR \u4E0E\u8BC4\u5206\u9608\u503C\u51B3\u5B9A\u4E1A\u52A1\u5904\u7406\u53C2\u8003\uFF0C\u4E24\u8005\u5206\u522B\u914D\u7F6E\u3002</p><dl class="parameter-list"><dt>Temperature</dt><dd>\u63A7\u5236\u91C7\u6837\u968F\u673A\u6027\u3002\u4E0A\u65B9\u53EF\u6A21\u62DF\u9009\u62E9\u8DDF\u968F\u6A21\u578B\u6216\u4E3A\u5F53\u524D\u4F1A\u8BDD\u81EA\u5B9A\u4E49\u3002</dd><dt>\u8F93\u51FA\u957F\u5EA6</dt><dd>\u6B63\u5F0F\u52A9\u624B\u76EE\u524D\u6BCF\u6B21\u8BF7\u6C42\u6700\u591A 2,048 Token\uFF1B\u539F\u578B\u53EA\u62AB\u9732\uFF0C\u4E0D\u4FEE\u6539\u3002</dd><dt>\u63A8\u7406\u5F3A\u5EA6</dt><dd>\u6309\u6A21\u578B\u652F\u6301\u8303\u56F4\u63D0\u4F9B\uFF1B\u4E0D\u80FD\u4FDD\u8BC1\u6240\u6709\u6A21\u578B\u5747\u53EF\u8C03\u6574\u3002</dd></dl><details class="disclosure"><summary>\u5176\u4ED6\u53C2\u6570\u4E0E\u751F\u6548\u8303\u56F4</summary><p>top_p\u3001\u60E9\u7F5A\u7CFB\u6570\u3001stop \u7B49\u4E0D\u80FD\u4EC5\u56E0\u63A5\u53E3\u540D\u79F0\u5E38\u89C1\u5C31\u63D0\u4F9B\u5F00\u5173\u3002\u9700\u9010\u9879\u6838\u5BF9\u5B9E\u9645\u8C03\u7528\u94FE\uFF0C\u672A\u63A5\u901A\u65F6\u4E0D\u663E\u793A\u53EF\u4FDD\u5B58\u7684\u63A7\u4EF6\u3002</p><p>\u6E29\u5EA6\u5728\u539F\u578B\u4E2D\u6309\u5F53\u524D\u4F1A\u8BDD\u5C55\u793A\uFF1B\u4E2A\u4EBA\u89C4\u5219\u548C\u957F\u671F\u80CC\u666F\u6309\u672C\u4EBA\u8DE8\u4F1A\u8BDD\u4F7F\u7528\u3002\u6A21\u578B\u4F9B\u5E94\u5546\u3001\u8EAB\u4EFD\u6743\u9650\u4E0E\u5168\u5C40\u9884\u7B97\u7531\u7CFB\u7EDF\u7BA1\u7406\u3002</p></details></section><section class="capability-block"><h3>\u8FD0\u884C\u4E0E\u4E0A\u4E0B\u6587</h3><dl class="parameter-list"><dt>\u5904\u7406\u9884\u7B97</dt><dd>\u76EE\u524D\u6BCF\u8F6E\u6700\u591A 8 \u6B65\u300112 \u6B21\u5DE5\u5177\u8C03\u7528\u3001180 \u79D2\u3002</dd><dt>\u6392\u961F</dt><dd>\u76EE\u524D\u5168\u5C40 1 \u6761\u6267\u884C\uFF0C\u6700\u591A 3 \u6761\u7B49\u5F85\u3002\u7B49\u5F85\u4E0D\u4EE3\u8868\u6A21\u578B\u5DF2\u7ECF\u5F00\u59CB\u751F\u6210\u3002</dd><dt>\u8BB0\u5FC6\u4F7F\u7528</dt><dd>\u52A0\u8F7D\u6709\u6548\u4E2A\u4EBA\u89C4\u5219\u5E76\u6709\u9650\u53EC\u56DE\uFF1B\u5DE5\u4F5C\u4E8B\u9879\u4E0E\u53EF\u9760\u7EED\u529E\u662F\u5F85\u5B9E\u73B0\u76EE\u6807\u3002</dd></dl><details class="disclosure"><summary>\u67E5\u770B\u4E0A\u4E0B\u6587\u7EC4\u6210</summary><p>\u7CFB\u7EDF\u804C\u8D23\u4E0E\u6743\u9650 \u2192 \u5F53\u524D\u8BF7\u6C42 \u2192 \u7ECF\u6838\u5BF9\u7684\u5DE5\u4F5C\u72B6\u6001\u4E0E\u4E1A\u52A1\u8BC1\u636E \u2192 \u76F8\u5173\u4E2A\u4EBA\u80CC\u666F\u3002\u5B57\u6BB5\u4E0E\u5DE5\u5177\u65B9\u6CD5\u7531 Skill/\u5951\u7EA6\u63CF\u8FF0\u3002</p><p>\u538B\u7F29\u4FDD\u7559\u76EE\u6807\u3001\u672A\u51B3\u95EE\u9898\u3001\u5BF9\u8C61\u4E0E\u64CD\u4F5C\u5F15\u7528\uFF0C\u4E0D\u628A\u6458\u8981\u4F5C\u4E3A\u5199\u5165\u56DE\u6267\u3002\u6B64\u5904\u662F\u76EE\u6807\u7ED3\u6784\uFF0C\u5C1A\u672A\u6539\u53D8\u8FD0\u884C\u65F6\u3002</p></details></section>`;
}
var demoSessions = {
  classroom: { title: "\u672C\u5468\u7684\u8BFE\u5802\u8BB0\u5F55", loaded: true, draft: "\u628A\u9605\u8BFB\u68C0\u67E5\u4E2D\u5C0F\u6797\u548C\u5C0F\u5468\u7684\u7ED3\u679C\u8BB0\u4E3A\u5DF2\u5B8C\u6210\u3002", status: "", messages: [{ role: "assistant", text: "\u53EF\u4EE5\u5148\u6838\u5BF9\u8FD9\u6B21\u9605\u8BFB\u68C0\u67E5\uFF0C\u518D\u9884\u89C8\u5177\u4F53\u4FEE\u6539\u3002\u6240\u6709\u59D3\u540D\u4E0E\u8BB0\u5F55\u90FD\u662F\u6F14\u793A\u6570\u636E\u3002" }] },
  follow: { title: "\u4F5C\u4E1A\u8865\u4EA4\u8DDF\u8FDB", loaded: false, draft: "", status: "", messages: [] },
  discussion: { title: "\u8BFE\u5802\u8BA8\u8BBA\u600E\u4E48\u7EC4\u7EC7", loaded: true, draft: "", status: "", messages: [{ role: "user", text: "\u4E0B\u6B21\u8BA8\u8BBA\u5148\u72EC\u7ACB\u601D\u8003\uFF0C\u518D\u5206\u7EC4\u4EA4\u6D41\u3002" }, { role: "assistant", text: "\u5148\u4FDD\u7559\u8FD9\u4E2A\u65B9\u6848\u3002\u63A5\u4E0B\u6765\u9700\u8981\u786E\u5B9A\u8BFE\u6587\u548C\u5206\u7EC4\u65B9\u5F0F\uFF0C\u5C1A\u672A\u5B89\u6392\u5B9E\u9645\u65E5\u7A0B\u3002" }] }
};
var demoActive = "classroom";
var demoMode = "normal";
var localSequence = 0;
var demoTimers = /* @__PURE__ */ new Set();
function later(fn, delay) {
  const timer = setTimeout(() => {
    demoTimers.delete(timer);
    fn();
  }, delay);
  demoTimers.add(timer);
  return timer;
}
function activeDemo() {
  return demoSessions[demoActive];
}
function updateDemo(key) {
  if (demoActive === key) renderDemo();
}
function renderDemo() {
  const session = activeDemo(), reading = $(".chat-reading");
  const sameSession = reading.dataset.session === demoActive;
  const previousScroll = reading.scrollTop;
  const nearBottom = reading.scrollHeight - reading.clientHeight - previousScroll < 70;
  reading.dataset.session = demoActive;
  disposeWithin(reading);
  $("#demo-session-title").textContent = session.title;
  $("#demo-history-status").textContent = session.historyStatus || "";
  $("#demo-history-status").hidden = !session.historyStatus;
  $(".chat-reading").innerHTML = session.loaded ? session.messages.map((m, i) => m.role === "user" ? `<div class="message-group"><p class="user-message">${esc(m.text)}</p>${m.status ? `<p class="submission-status" role="status">${esc(m.status)}</p>` : ""}</div>` : `<article class="answer"><span class="assistant-mark">\u9752\u677E \xB7 \u6F14\u793A</span>${m.text ? `<p>${esc(m.text)}</p>` : ""}${m.phase ? renderOperation(m, i) : ""}</article>`).join("") : `<div class="history-placeholder" role="status"><span class="loading-dot"></span><p>\u6B63\u5728\u8BFB\u53D6\u300C${esc(session.title)}\u300D\u7684\u5386\u53F2</p><small>\u4E0D\u4F1A\u628A\u5176\u4ED6\u4F1A\u8BDD\u7684\u5185\u5BB9\u663E\u793A\u5728\u8FD9\u91CC\u3002</small></div>`;
  $("#chat-draft").value = session.draft;
  $("#chat-draft").disabled = !session.loaded;
  $("#send-demo").disabled = !session.loaded || Boolean(session.busy);
  $("#demo-composer-status").textContent = session.status || "\u4EC5\u6F14\u793A\uFF0C\u4E0D\u53D1\u9001\u771F\u5B9E\u8BF7\u6C42";
  $("#demo-conversations").innerHTML = Object.entries(demoSessions).map(([key, value]) => `<button data-demo-session="${key}" class="${key === demoActive ? "selected" : ""}" aria-current="${key === demoActive ? "page" : "false"}">${value.title}${value.busy ? " \xB7 \u5904\u7406\u4E2D" : ""}</button>`).join("");
  $("#demo-conversations").querySelectorAll("button").forEach((b) => b.onclick = () => switchDemo(b.dataset.demoSession, true));
  $(".chat-reading").querySelectorAll("[data-op]").forEach((b) => b.onclick = () => operateDemo(b.dataset.op, Number(b.dataset.index)));
  hydrate(reading);
  reading.scrollTop = !sameSession || nearBottom ? reading.scrollHeight : previousScroll;
}
function renderOperation(message, index) {
  const act = (action, label, primary = false) => `<button type="button" class="material ${primary ? "primary" : ""}" data-op="${action}" data-index="${index}"><span class="lg-content">${label}</span></button>`;
  const phase = message.phase;
  return `<section class="operation-card"><span class="status-pill">${{ preview: "\u5F85\u786E\u8BA4", executing: "\u6B63\u5728\u63D0\u4EA4", done: "\u5DF2\u6838\u5BF9\u63D0\u4EA4\u7ED3\u679C", unknown: "\u7ED3\u679C\u5F85\u6838\u5BF9", checking: "\u6B63\u5728\u6838\u5BF9", conflict: "\u8BB0\u5F55\u5DF2\u53D8\u5316", cancelled: "\u5DF2\u53D6\u6D88" }[phase]}</span><h3>\u4E03\u5E74\u7EA7\u4E00\u73ED \xB7 \u9605\u8BFB\u68C0\u67E5</h3>${phase === "preview" ? `<p>\u5C0F\u6797\u3001\u5C0F\u5468\uFF1A\u672A\u8BB0\u5F55 \u2192 \u5DF2\u5B8C\u6210</p><p class="operation-meta">\u4EC5\u8FD9\u4E24\u540D\u5B66\u751F \xB7 \u4E0D\u4FEE\u6539\u5B66\u751F\u6863\u6848</p><details><summary>\u67E5\u770B\u4F9D\u636E\u4E0E\u8303\u56F4</summary><p>\u6F14\u793A\u4EFB\u52A1 T-1028\uFF1B\u6210\u5458\u7248\u672C 3\u30017\uFF1B\u5F53\u524D\u65E0\u5DF2\u8BB0\u5F55\u7ED3\u679C\u3002\u6B63\u5F0F\u6267\u884C\u9700\u91CD\u65B0\u6821\u9A8C\u7248\u672C\u4E0E\u6743\u9650\u3002</p></details><div class="operation-actions">${act("cancel", "\u53D6\u6D88")}${act("confirm", "\u786E\u8BA4\u8FD9\u6B21\u8BB0\u5F55", true)}</div>` : phase === "conflict" ? `<p>\u5C0F\u5468\u7684\u7ED3\u679C\u5DF2\u7531\u5176\u4ED6\u64CD\u4F5C\u66F4\u65B0\u3002\u672C\u6B21\u6CA1\u6709\u63D0\u4EA4\uFF0C\u4E5F\u4E0D\u4F1A\u8986\u76D6\u65B0\u8BB0\u5F55\u3002</p><div class="operation-actions">${act("refresh", "\u67E5\u770B\u6700\u65B0\u8BB0\u5F55", true)}</div>` : phase === "unknown" ? `<p>\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u5C1A\u4E0D\u80FD\u786E\u8BA4\u662F\u5426\u4FDD\u5B58\u3002\u4FDD\u7559\u539F\u64CD\u4F5C\u7F16\u53F7\uFF0C\u5148\u6838\u5BF9\u7ED3\u679C\uFF0C\u907F\u514D\u91CD\u590D\u8BB0\u5F55\u3002</p><p class="operation-meta">\u6F14\u793A\u64CD\u4F5C ${esc(message.operationId)}</p><div class="operation-actions">${act("reconcile", "\u6838\u5BF9\u539F\u64CD\u4F5C", true)}</div>` : phase === "done" ? `<p>\u6F14\u793A\u56DE\u6267\uFF1A\u5C0F\u6797\u3001\u5C0F\u5468\u7684\u672C\u6B21\u7ED3\u679C\u5DF2\u8BB0\u5F55\u3002</p><dl><dt>\u64CD\u4F5C\u7F16\u53F7</dt><dd>${esc(message.operationId)}</dd><dt>\u7ED3\u679C\u4F9D\u636E</dt><dd>\u539F\u64CD\u4F5C\u56DE\u6267 \xB7 2 \u6761\u4E8B\u4EF6</dd></dl><p class="operation-meta">\u8FD9\u662F\u4E00\u4EFD\u6A21\u62DF\u56DE\u6267\uFF0C\u771F\u5B9E\u8BFE\u5802\u6570\u636E\u672A\u4FEE\u6539\u3002</p>` : phase === "cancelled" ? "<p>\u672C\u6B21\u672A\u63D0\u4EA4\uFF0C\u539F\u8BB0\u5F55\u4FDD\u6301\u539F\u72B6\u3002</p>" : `<p role="status"><span class="loading-dot"></span>${phase === "checking" ? "\u6309\u539F\u64CD\u4F5C\u7F16\u53F7\u67E5\u8BE2\u63D0\u4EA4\u7ED3\u679C\u2026" : "\u6B63\u5728\u63D0\u4EA4\u8FD9\u4E24\u540D\u5B66\u751F\u7684\u8BB0\u5F55\u2026"}</p>`}</section>`;
}
function switchDemo(key, refresh) {
  const old = activeDemo();
  old.draft = $("#chat-draft").value;
  demoActive = key;
  const session = activeDemo();
  if (!refresh) {
    renderDemo();
    return;
  }
  if (session.historyTimer) {
    clearTimeout(session.historyTimer);
    demoTimers.delete(session.historyTimer);
  }
  session.historyStatus = session.loaded ? "\u5DF2\u663E\u793A\u6B64\u4F1A\u8BDD\u7684\u672C\u5730\u5185\u5BB9\uFF0C\u6B63\u5728\u6838\u5BF9\u6700\u65B0\u8BB0\u5F55\u2026" : "\u6B63\u5728\u8BFB\u53D6\u5386\u53F2\u2026";
  renderDemo();
  if (matchMedia("(max-width:700px)").matches || $("#preview").classList.contains("phone")) collapse(true);
  session.historyTimer = later(() => {
    session.historyTimer = null;
    if (!session.loaded) {
      session.loaded = true;
      session.messages = [{ role: "user", text: "\u5468\u4E94\u518D\u770B\u5C0F\u6797\u662F\u5426\u8865\u4EA4\uFF0C\u5148\u4E0D\u8981\u516C\u5F00\u70B9\u540D\u3002" }, { role: "assistant", text: "\u4E0A\u6B21\u7EA6\u5B9A\u662F\u5468\u4E94\u6838\u5BF9\u8865\u4EA4\u60C5\u51B5\uFF0C\u518D\u51B3\u5B9A\u4E0B\u4E00\u6B65\u3002\u73B0\u5728\u7EE7\u7EED\u65F6\u4F1A\u5148\u8BFB\u53D6\u6700\u65B0\u8BFE\u5802\u8BB0\u5F55\uFF1B\u65E7\u7EA6\u5B9A\u4E0D\u4EE3\u8868\u5DF2\u7ECF\u8865\u4EA4\u3002" }];
    }
    session.historyStatus = "";
    updateDemo(key);
  }, demoMode === "history" ? 3500 : 1e3);
}
function sendDemo() {
  const session = activeDemo();
  const text = $("#chat-draft").value.trim();
  if (!text || session.busy || !session.loaded) return;
  const key = demoActive, mode = demoMode;
  const message = { role: "user", text, status: "\u6B63\u5728\u53D1\u9001\u2026" };
  session.messages.push(message);
  session.draft = "";
  session.busy = true;
  session.status = "\u6D88\u606F\u5DF2\u663E\u793A\u5728\u672C\u673A\uFF0C\u6B63\u5728\u7B49\u5F85\u63A5\u6536\u786E\u8BA4";
  renderDemo();
  $(".chat-reading").scrollTop = $(".chat-reading").scrollHeight;
  later(() => {
    message.status = "\u5DF2\u63A5\u6536";
    session.status = mode === "queue" ? "\u5DF2\u63A5\u6536\uFF0C\u7B49\u5F85\u5904\u7406\uFF1B\u8BF7\u52FF\u91CD\u590D\u53D1\u9001" : "\u6B63\u5728\u6838\u5BF9\u4EFB\u52A1\u4E0E\u5B66\u751F\u8BB0\u5F55\u2026";
    updateDemo(key);
  }, 450);
  later(() => {
    session.busy = false;
    session.status = "\u4EC5\u6F14\u793A\uFF0C\u4E0D\u53D1\u9001\u771F\u5B9E\u8BF7\u6C42";
    const operationId = "DEMO-" + String(++localSequence).padStart(4, "0");
    session.messages.push(key === "follow" ? { role: "assistant", text: "\u5DF2\u91CD\u65B0\u6838\u5BF9\u6F14\u793A\u4EFB\u52A1\uFF1A\u5F53\u524D\u4ECD\u672A\u8BB0\u5F55\u7ED3\u679C\u3002\u4E0A\u6B21\u6C9F\u901A\u7EA6\u5B9A\u4E0D\u80FD\u8BC1\u660E\u5DF2\u8865\u4EA4\u3002\u8BF7\u5148\u786E\u8BA4\u5B9E\u9645\u8865\u4EA4\u60C5\u51B5\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u66F4\u65B0\uFF1B\u672C\u6B21\u6CA1\u6709\u5199\u5165\u3002" } : key === "discussion" ? { role: "assistant", text: "\u6211\u4EEC\u4FDD\u7559\u5148\u72EC\u7ACB\u601D\u8003\u518D\u5206\u7EC4\u4EA4\u6D41\u7684\u65B9\u6848\u3002\u8BF7\u8865\u5145\u8BFE\u6587\uFF0C\u63A5\u7740\u624D\u80FD\u786E\u5B9A\u5177\u4F53\u95EE\u9898\u4E0E\u65F6\u95F4\u5B89\u6392\u3002" } : { role: "assistant", text: key === "follow" ? "\u5DF2\u91CD\u65B0\u8BFB\u53D6\u6F14\u793A\u4EFB\u52A1\u3002\u5F53\u524D\u7ED3\u679C\u4ECD\u672A\u8BB0\u5F55\uFF1B\u4E0A\u6B21\u6C9F\u901A\u7EA6\u5B9A\u4E0D\u7B49\u4E8E\u5DF2\u5B8C\u6210\u3002\u8BF7\u5148\u6838\u5B9E\u8865\u4EA4\u60C5\u51B5\uFF0C\u518D\u786E\u8BA4\u662F\u5426\u66F4\u65B0\u3002" : "\u5DF2\u6838\u5BF9\u6F14\u793A\u4EFB\u52A1\u4E0E\u4E24\u540D\u53C2\u4E0E\u5B66\u751F\uFF0C\u8BF7\u786E\u8BA4\u4E0B\u9762\u7684\u4FEE\u6539\u3002", phase: "preview", operationId, mode });
    updateDemo(key);
  }, mode === "queue" ? 4e3 : 1400);
}
function operateDemo(action, index) {
  const key = demoActive, session = activeDemo(), message = session.messages[index];
  if (action === "cancel") {
    message.phase = "cancelled";
    renderDemo();
    return;
  }
  if (action === "refresh") {
    message.phase = "cancelled";
    message.text = "\u6700\u65B0\u6F14\u793A\u8BB0\u5F55\u663E\u793A\u5C0F\u5468\u5DF2\u5B8C\u6210\uFF1B\u539F\u6279\u6B21\u4F5C\u5E9F\u3002\u8BF7\u6838\u5BF9\u5C0F\u6797\u60C5\u51B5\u540E\u91CD\u65B0\u63D0\u51FA\u5177\u4F53\u4FEE\u6539\u3002";
    renderDemo();
    return;
  }
  if (action === "reconcile") {
    message.phase = "checking";
    renderDemo();
    later(() => {
      message.phase = "done";
      session.busy = false;
      session.status = "\u5DF2\u6309\u539F\u7F16\u53F7\u67E5\u5230\u6A21\u62DF\u56DE\u6267\uFF0C\u6CA1\u6709\u91CD\u590D\u63D0\u4EA4";
      updateDemo(key);
    }, 1200);
    return;
  }
  if (action === "confirm" && message.phase === "preview") {
    if (message.mode === "conflict") {
      message.phase = "conflict";
      renderDemo();
      return;
    }
    message.phase = "executing";
    session.busy = true;
    session.status = "\u6B63\u5728\u63D0\u4EA4\uFF0C\u8BF7\u52FF\u91CD\u590D\u64CD\u4F5C";
    renderDemo();
    later(() => {
      message.phase = message.mode === "unknown" ? "unknown" : "done";
      session.busy = false;
      session.status = message.mode === "unknown" ? "\u63D0\u4EA4\u7ED3\u679C\u5F85\u6838\u5BF9\uFF0C\u8BF7\u5148\u67E5\u8BE2\u539F\u64CD\u4F5C" : "\u5DF2\u6838\u5BF9\u6A21\u62DF\u56DE\u6267";
      updateDemo(key);
    }, 1e3);
  }
}
function initDemo() {
  const reading = $(".chat-reading");
  reading.id = "demo-reading";
  reading.setAttribute("aria-label", "\u5F53\u524D\u4F1A\u8BDD\u6D88\u606F");
  const header = document.createElement("header");
  header.className = "conversation-heading";
  header.innerHTML = '<h2 id="demo-session-title"></h2><p id="demo-history-status" role="status" hidden></p>';
  reading.before(header);
  $(".composer>div>span").id = "demo-composer-status";
  $("#demo-composer-status").setAttribute("role", "status");
  $("#demo-composer-status").setAttribute("aria-live", "polite");
  $("#chat-draft").oninput = (e) => activeDemo().draft = e.target.value;
  $("#demo-mode").onchange = (e) => {
    demoMode = e.target.value;
    toast("\u6F14\u793A\u6761\u4EF6\u5DF2\u5207\u6362\uFF0C\u4E0B\u6B21\u53D1\u9001\u6216\u5207\u6362\u4F1A\u8BDD\u65F6\u751F\u6548\u3002");
  };
  $(".conversation-list").id = "demo-conversations";
  $(".new-chat").onclick = () => {
    const key = "new-" + ++localSequence;
    demoSessions[key] = { title: "\u65B0\u5BF9\u8BDD \xB7 " + localSequence, loaded: true, draft: "", status: "", messages: [{ role: "assistant", text: "\u8FD9\u662F\u65B0\u7684\u6F14\u793A\u4F1A\u8BDD\u3002\u53EF\u4EE5\u4ECE\u300C\u8BB0\u5FC6\u4E0E\u4E8B\u9879\u300D\u7EE7\u7EED\u65E7\u5DE5\u4F5C\uFF0C\u4E5F\u53EF\u8F93\u5165\u6D88\u606F\u67E5\u770B\u6A21\u62DF\u8BFE\u5802\u8BB0\u5F55\u6D41\u7A0B\u3002" }] };
    scene("chat");
    switchDemo(key, false);
    collapse(true);
    $("#chat-draft").focus();
  };
  renderDemo();
}
renderSettings();
hydrate();
initDemo();
window.addEventListener("beforeunload", () => {
  for (const timer of demoTimers) clearTimeout(timer);
  for (const api of materials.values()) api.destroy();
});
/*! Bundled license information:

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/settings.js:
  (**
   * @license lucide-react v0.546.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
