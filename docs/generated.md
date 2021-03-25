## Classes

<dl>
<dt><a href="#DynamicConfig">DynamicConfig</a></dt>
<dd><p>Returns the data for a DynamicConfig in the statsig console via typed get functions</p>
</dd>
</dl>

## Objects

<dl>
<dt><a href="#typedefs">typedefs</a> : <code>object</code></dt>
<dd></dd>
</dl>

## Constants

<dl>
<dt><a href="#statsig">statsig</a></dt>
<dd><p>The global statsig class for interacting with gates, configs, experiments configured in the statsig developer console.  Also used for event logging to view in the statsig console, or for analyzing experiment impacts using pulse.</p>
</dd>
</dl>

<a name="DynamicConfig"></a>

## DynamicConfig
Returns the data for a DynamicConfig in the statsig console via typed get functions

**Kind**: global class  

* [DynamicConfig](#DynamicConfig)
    * [.getBool(name, [defaultValue])](#DynamicConfig+getBool) ⇒ <code>boolean</code>
    * [.getString(name, [defaultValue])](#DynamicConfig+getString) ⇒ <code>string</code>
    * [.getNumber(name, [defaultValue])](#DynamicConfig+getNumber) ⇒ <code>number</code>
    * [.getArray(name, [defaultValue])](#DynamicConfig+getArray) ⇒ <code>Array</code>
    * [.getObject(name, [defaultValue])](#DynamicConfig+getObject) ⇒ [<code>DynamicConfig</code>](#DynamicConfig)
    * [.getRawValue()](#DynamicConfig+getRawValue) ⇒ <code>any</code>

<a name="DynamicConfig+getBool"></a>

### dynamicConfig.getBool(name, [defaultValue]) ⇒ <code>boolean</code>
Returns the boolean value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  
**Throws**:

- Error if the provided defaultValue is not a boolean


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>boolean</code> | <code>false</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getString"></a>

### dynamicConfig.getString(name, [defaultValue]) ⇒ <code>string</code>
Returns the string value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  
**Throws**:

- Error if the provided defaultValue is not a string


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>string</code> | <code>&quot;&#x27;&#x27;&quot;</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getNumber"></a>

### dynamicConfig.getNumber(name, [defaultValue]) ⇒ <code>number</code>
Returns the number value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  
**Throws**:

- Error if the provided defaultValue is not a number


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>number</code> | <code>0</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getArray"></a>

### dynamicConfig.getArray(name, [defaultValue]) ⇒ <code>Array</code>
Returns the Array value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  
**Throws**:

- Error if the provided defaultValue is not an Array


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>Array</code> | <code>[]</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getObject"></a>

### dynamicConfig.getObject(name, [defaultValue]) ⇒ [<code>DynamicConfig</code>](#DynamicConfig)
Returns the object value of the given parameter as another DynamicConfig, or a DynamicConfig representing the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  
**Throws**:

- Error if the provided defaultValue is not an object


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>object</code> | <code>{}</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getRawValue"></a>

### dynamicConfig.getRawValue() ⇒ <code>any</code>
Returns the raw value of the DynamicConfig

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  
<a name="typedefs"></a>

## typedefs : <code>object</code>
**Kind**: global namespace  

* [typedefs](#typedefs) : <code>object</code>
    * [.StatsigUser](#typedefs.StatsigUser) : <code>Object.&lt;string, \*&gt;</code>
    * [.StatsigOptions](#typedefs.StatsigOptions) : <code>Object.&lt;string, \*&gt;</code>

<a name="typedefs.StatsigUser"></a>

### typedefs.StatsigUser : <code>Object.&lt;string, \*&gt;</code>
An object of properties relating to the current user
Provide as many as possible to take advantage of advanced conditions in the statsig console
A dictionary of additional fields can be provided under the "custom" field

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  
**Properties**

| Name | Type |
| --- | --- |
| [userID] | <code>string</code> \| <code>number</code> | 
| [email] | <code>string</code> | 
| [ip] | <code>string</code> | 
| [userAgent] | <code>string</code> | 
| [country] | <code>string</code> | 
| [locale] | <code>string</code> | 
| [clientVersion] | <code>string</code> | 
| [custom] | <code>object</code> | 

<a name="typedefs.StatsigOptions"></a>

### typedefs.StatsigOptions : <code>Object.&lt;string, \*&gt;</code>
An object of properties for initializing the sdk with advanced options

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  
**Properties**

| Name | Type |
| --- | --- |
| [api] | <code>string</code> | 

<a name="statsig"></a>

## statsig
The global statsig class for interacting with gates, configs, experiments configured in the statsig developer console.  Also used for event logging to view in the statsig console, or for analyzing experiment impacts using pulse.

**Kind**: global constant  

* [statsig](#statsig)
    * [.initialize(secretKey, [options])](#statsig.initialize) ⇒ <code>Promise.&lt;void&gt;</code>
    * [.checkGate(user, gateName)](#statsig.checkGate) ⇒ <code>Promise.&lt;boolean&gt;</code>
    * [.getConfig(user, configName)](#statsig.getConfig) ⇒ [<code>Promise.&lt;DynamicConfig&gt;</code>](#DynamicConfig)
    * [.logEvent(user, eventName, value, metadata)](#statsig.logEvent)
    * [.isReady()](#statsig.isReady) ⇒ <code>boolean</code>
    * [.shutdown()](#statsig.shutdown)

<a name="statsig.initialize"></a>

### statsig.initialize(secretKey, [options]) ⇒ <code>Promise.&lt;void&gt;</code>
Initializes the statsig server SDK. This must be called before checking gates/configs or logging events.

**Kind**: static method of [<code>statsig</code>](#statsig)  
**Returns**: <code>Promise.&lt;void&gt;</code> - - a promise which rejects only if you fail to provide a proper SDK Key  
**Throws**:

- Error if a Server Secret Key is not provided


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| secretKey | <code>string</code> |  | The secret key for this project from the statsig console. Secret keys should be kept secure on the server side, and not used for client-side integrations |
| [options] | [<code>StatsigOptions</code>](#typedefs.StatsigOptions) | <code>{}</code> | manual sdk configuration for advanced setup |

<a name="statsig.checkGate"></a>

### statsig.checkGate(user, gateName) ⇒ <code>Promise.&lt;boolean&gt;</code>
Check the value of a gate configured in the statsig console

**Kind**: static method of [<code>statsig</code>](#statsig)  
**Returns**: <code>Promise.&lt;boolean&gt;</code> - - The value of the gate for the user.  Gates are off (return false) by default  
**Throws**:

- Error if initialize() was not called first
- Error if the gateName is not provided or not a string


| Param | Type | Description |
| --- | --- | --- |
| user | [<code>StatsigUser</code>](#typedefs.StatsigUser) | the user to check this gate value for |
| gateName | <code>string</code> | the name of the gate to check |

<a name="statsig.getConfig"></a>

### statsig.getConfig(user, configName) ⇒ [<code>Promise.&lt;DynamicConfig&gt;</code>](#DynamicConfig)
Checks the value of a config for a given user

**Kind**: static method of [<code>statsig</code>](#statsig)  
**Returns**: [<code>Promise.&lt;DynamicConfig&gt;</code>](#DynamicConfig) - - the config for the user  
**Throws**:

- Error if initialize() was not called first
- Error if the configName is not provided or not a string


| Param | Type | Description |
| --- | --- | --- |
| user | [<code>StatsigUser</code>](#typedefs.StatsigUser) | the user to evaluate for the dyamic config |
| configName | <code>string</code> | the name of the dynamic config to get |

<a name="statsig.logEvent"></a>

### statsig.logEvent(user, eventName, value, metadata)
Log an event for data analysis and alerting or to measure the impact of an experiment

**Kind**: static method of [<code>statsig</code>](#statsig)  

| Param | Type | Description |
| --- | --- | --- |
| user | [<code>StatsigUser</code>](#typedefs.StatsigUser) | the user associated with this event |
| eventName | <code>string</code> | the name of the event (name = Purchase) |
| value | <code>string</code> \| <code>number</code> | the value associated with the event (value = 10) |
| metadata | <code>object</code> | other attributes associated with this event (metadata = {items: 2, currency: USD}) |

<a name="statsig.isReady"></a>

### statsig.isReady() ⇒ <code>boolean</code>
Checks to see if the SDK is in a ready state to check gates and configs
If the SDK is initializing or switching users, it is not in a ready state.

**Kind**: static method of [<code>statsig</code>](#statsig)  
**Returns**: <code>boolean</code> - if the SDK is ready  
<a name="statsig.shutdown"></a>

### statsig.shutdown()
Informs the statsig SDK that the server is closing or shutting down
so the SDK can clean up internal state

**Kind**: static method of [<code>statsig</code>](#statsig)  
