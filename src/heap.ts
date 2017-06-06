// declare var console;


// export interface IProxyable {
//   memoryMap: HeapMemoryMap;
//   memory: Float64Array;
// }

// export interface HeapProxy<T> {
//   toJSON(): T[];
//   readonly length: number;
//   [unit: number]: T;
// }

// export interface ProxyNumbers1D extends HeapProxy<number> { }
// export interface ProxyNumbers2D extends HeapProxy<ProxyNumbers1D> { }
// export interface ProxyNumbers3D extends HeapProxy<ProxyNumbers2D> { }

// export function CreateHeapProxy(target: IProxyable, key: string): HeapProxy<number> {
//   let proxy = null;

//   const toJSON = () => {
//     let value: number[] = [];
//     for (let index = 0; index < target.memoryMap.lengths[key]; index++) {
//       const variable = target.memoryMap.variables[`${key}[${index}]`];
//       if (variable) {
//         value.push(target.memory[variable.id]);
//       } else {
//         value.push(0);
//       }
//     }
//     return value;
//   };

//   proxy = new Proxy({}, {
//     get(obj, prop: string, receiver) {
//       if (prop === 'length') {
//         return target.memoryMap.lengths[key];
//       }
//       if (prop === 'toJSON') {
//         return toJSON;
//       }
//       const variable: Variable = target.memoryMap.variables[`${key}[${prop}]`];
//       if (variable) {
//         return target.memory[variable.id];
//       }
//       throw new Error(`Variable ${key}[${prop}] doesn't exist`);
//     },
//     set(obj, prop: string, newValue: number, targetObj) {
//       const variable: Variable = target.memoryMap.variables[`${key}[${prop}]`];
//       if (variable) {
//         target.memory[variable.id] = newValue;
//         return true;
//       }
//       return false;
//     }
//   });

//   return proxy;
// }

// export function CreateDictionaryProxy<T>(constructUnknownKey: (key: string) => T): HeapProxy<T> {
//   let proxy = null;

//   let theObject = Object.create(null);
//   let keys = [];

//   const toJSON = () => theObject; // keys.sort().map($ => theObject[$]);

//   proxy = new Proxy({}, {
//     get(obj, key: string, receiver) {
//       if (key === 'length') {
//         return keys.length;
//       }
//       if (key === 'toJSON') {
//         return toJSON;
//       }

//       if (key in theObject)
//         return theObject[key];

//       let newItem = constructUnknownKey(key);

//       if (newItem) {
//         keys.push(key);
//         theObject[key] = newItem;
//         return newItem;
//       }

//       throw new Error('Cannot create key: ' + key);
//     },
//     ownKeys() {
//       return keys;
//     }
//   });

//   return proxy;
// }

// export function HeapProxy(dimentions: number = 1): PropertyDecorator {
//   return function (target: IProxyable, key: string) {
//     let proxy = null;



//     Object.defineProperty(target, key, {
//       enumerable: true,
//       configurable: false,
//       get: function () {
//         if (proxy == null) {
//           if (dimentions == 1) {
//             proxy = CreateHeapProxy(this, key);
//           } else if (dimentions > 1) {
//             let creators: Array<(key: string) => any> = [(key: string) => CreateHeapProxy(this, key)];

//             for (let i = 1; i <= dimentions; i++) {
//               creators.push((key: string) => {
//                 CreateDictionaryProxy(k => creators[i - 1](`${key}[${k}]`));
//               });
//             }

//             proxy = creators.pop()(key);
//           } else {
//             throw new Error("HeapProxy: Dimentions must be > 0");
//           }
//         }
//         return proxy;
//       }
//     });
//   };
// }

// export class HeapMemoryMap {
//   allocCount: number = 0;
//   variables: Dictionary<Variable> = {};
//   lengths: Dictionary<number> = {};

//   alloc(tag: string, index: number, value: number): Variable {
//     const key = `${tag}[${index}]`;
//     if (!(key in this.variables)) {
//       this.variables[key] = new Variable(this.allocCount++, key, value, tag);
//     }
//     this.lengths[tag] = (this.lengths[tag] | 0) + 1;
//     return this.variables[key];
//   }

//   clean() {
//     this.allocCount = 0;
//     for (let i in this.variables) {
//       delete this.variables[i];
//     }
//     for (let i in this.lengths) {
//       delete this.lengths[i];
//     }
//   }
// }

// import { Variable, Dictionary } from "./index";


// function assert(condition: boolean, message: string) {
//   if (!condition) {
//     throw new Error(message);
//   }
//   console.log('   ✅   ' + message);
// }

// class Test implements IProxyable {
//   memoryMap = new HeapMemoryMap;
//   memory = new Float64Array(100);

//   @HeapProxy(1)
//   scalars: ProxyNumbers1D;

//   test1D() {
//     assert(JSON.stringify(this.scalars.toJSON()) == JSON.stringify([]), 'Empty scalars must be an empty array');

//     this.memoryMap.alloc(`scalars`, 0, 3.1);

//     console.dir(this.scalars.toJSON());
//     assert(JSON.stringify(this.scalars.toJSON()) == JSON.stringify([3.1]), '[3.1]');

//   }
// }

// let testInstance = new Test();
// testInstance.test1D();
