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

<a name="DynamicConfig"></a>

## DynamicConfig
Returns the data for a DynamicConfig in the statsig console via typed get functions

**Kind**: global class  

* [DynamicConfig](#DynamicConfig)
    * [.getBool(name, [defaultValue])](#DynamicConfig+getBool) ⇒ <code>boolean</code>
    * [.getString(name, [defaultValue])](#DynamicConfig+getString) ⇒ <code>string</code>
    * [.getNumber(name, [defaultValue])](#DynamicConfig+getNumber) ⇒ <code>number</code>
    * [.getObject(name, [defaultValue])](#DynamicConfig+getObject) ⇒ [<code>DynamicConfig</code>](#DynamicConfig)
    * [.getRawValue()](#DynamicConfig+getRawValue) ⇒ <code>any</code>

<a name="DynamicConfig+getBool"></a>

### dynamicConfig.getBool(name, [defaultValue]) ⇒ <code>boolean</code>
Returns the boolean value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>boolean</code> | <code>false</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getString"></a>

### dynamicConfig.getString(name, [defaultValue]) ⇒ <code>string</code>
Returns the string value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>string</code> | <code>&quot;&#x27;&#x27;&quot;</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getNumber"></a>

### dynamicConfig.getNumber(name, [defaultValue]) ⇒ <code>number</code>
Returns the number value of the given parameter, or the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| name | <code>string</code> |  | The name of the parameter to check |
| [defaultValue] | <code>number</code> | <code>0</code> | The default value of the parameter to return in cases where the parameter is not found or is not the correct type. |

<a name="DynamicConfig+getObject"></a>

### dynamicConfig.getObject(name, [defaultValue]) ⇒ [<code>DynamicConfig</code>](#DynamicConfig)
Returns the object value of the given parameter as another DynamicConfig, or a DynamicConfig representing the defaultValue if not found.

**Kind**: instance method of [<code>DynamicConfig</code>](#DynamicConfig)  

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
    * [.valueFn](#typedefs.valueFn) ⇒ <code>object</code>
    * [.getBoolFn](#typedefs.getBoolFn) ⇒ <code>boolean</code>
    * [.getNumberFn](#typedefs.getNumberFn) ⇒ <code>number</code>
    * [.getStringFn](#typedefs.getStringFn) ⇒ <code>string</code>
    * [.getObjectFn](#typedefs.getObjectFn) ⇒ <code>object</code>

<a name="typedefs.StatsigUser"></a>

### typedefs.StatsigUser : <code>Object.&lt;string, \*&gt;</code>
An object of properties relating to a user

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  
**Properties**

| Name | Type |
| --- | --- |
| [userID] | <code>string</code> \| <code>number</code> | 
| [ip] | <code>string</code> | 
| [ua] | <code>string</code> | 
| [country] | <code>string</code> | 
| [email] | <code>string</code> | 
| [username] | <code>string</code> | 
| [custom] | <code>object</code> | 

<a name="typedefs.StatsigOptions"></a>

### typedefs.StatsigOptions : <code>Object.&lt;string, \*&gt;</code>
An object of properties for initializing the sdk with advanced options

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  
**Properties**

| Name | Type |
| --- | --- |
| [api] | <code>string</code> | 

<a name="typedefs.valueFn"></a>

### typedefs.valueFn ⇒ <code>object</code>
Returns the json object representing this config

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  
<a name="typedefs.getBoolFn"></a>

### typedefs.getBoolFn ⇒ <code>boolean</code>
Returns the boolean representation of the value at the given index in the config

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  

| Param | Type |
| --- | --- |
| index | <code>string</code> | 

<a name="typedefs.getNumberFn"></a>

### typedefs.getNumberFn ⇒ <code>number</code>
Returns the number representation of the value at the given index in the config

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  

| Param | Type |
| --- | --- |
| index | <code>string</code> | 

<a name="typedefs.getStringFn"></a>

### typedefs.getStringFn ⇒ <code>string</code>
Returns the string representation of the value at the given index in the config

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  

| Param | Type |
| --- | --- |
| index | <code>string</code> | 

<a name="typedefs.getObjectFn"></a>

### typedefs.getObjectFn ⇒ <code>object</code>
Returns the object representation of the value at the given index in the config

**Kind**: static typedef of [<code>typedefs</code>](#typedefs)  

| Param | Type |
| --- | --- |
| index | <code>string</code> | 

