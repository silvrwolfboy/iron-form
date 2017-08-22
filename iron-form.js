import '../polymer/polymer.js';
import '../iron-ajax/iron-ajax.js';
import { Polymer } from '../polymer/lib/legacy/polymer-fn.js';
import { dom } from '../polymer/lib/legacy/polymer.dom.js';
Polymer({
  _template: `
    <style>
      :host {
        display: block;
      }
    </style>

    <!-- This form is used to collect the elements that should be submitted -->
    <slot></slot>

    <!-- This form is used for submission -->
    <form id="helper" action\$="[[action]]" method\$="[[method]]" enctype\$="[[enctype]]"></form>
`,

  is: 'iron-form',

  properties: {
    /*
     * Set this to true if you don't want the form to be submitted through an
     * ajax request, and you want the page to redirect to the action URL
     * after the form has been submitted.
     */
    allowRedirect: {
      type: Boolean,
      value: false
    },
    /**
    * HTTP request headers to send. See PolymerElements/iron-ajax for
    * more details. Only works when `allowRedirect` is false.
    */
    headers: {
      type: Object,
      value: function() { return {}; }
    },
    /**
    * Set the `withCredentials` flag on the request. See PolymerElements/iron-ajax for
    * more details. Only works when `allowRedirect` is false.
    */
    withCredentials: {
      type: Boolean,
      value: false
    },
  },

  /**
   * Fired if the form cannot be submitted because it's invalid.
   *
   * @event iron-form-invalid
   */

  /**
   * Fired after the form is submitted.
   *
   * @event iron-form-submit
   */

  /**
   * Fired before the form is submitted.
   *
   * @event iron-form-presubmit
   */

  /**
   * Fired after the form is submitted and a response is received. An
   * IronRequestElement is included as the event.detail object.
   *
   * @event iron-form-response
  */

  /**
   * Fired after the form is submitted and an error is received. An
   * error message is included in event.detail.error and an 
   * IronRequestElement is included in event.detail.request.
   *
   * @event iron-form-error
  */

  attached: function() {
    this._nodeObserver = dom(this).observeNodes(
      function(mutations) {
        for (var i = 0; i < mutations.addedNodes.length; i++) {
          if (mutations.addedNodes[i].tagName === 'FORM' && !this._alreadyCalledInit) {
            this._alreadyCalledInit = true;
            this._form = mutations.addedNodes[i];
            this._init();
          }
        }
      }.bind(this));
  },

  detached: function() {
    if (this._nodeObserver) {
      dom(this).unobserveNodes(this._nodeObserver);
      this._nodeObserver = null;
    }
  },

  _init: function() {
    this._form.addEventListener('submit', this.submit.bind(this));
    this._form.addEventListener('reset', this.reset.bind(this));

    // Save the initial values.
    this._defaults = this._defaults || new WeakMap();
    var nodes = this._getSubmittableElements();
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!this._defaults.has(node)) {
        this._defaults.set(node, {
          checked: node.checked,
          value: node.value,
        });
      }
    }
  },

  /**
   * Validates all the required elements (custom and native) in the form.
   * @return {boolean} True if all the elements are valid.
   */
  validate: function() {
    if (this._form.getAttribute('novalidate') === '')
      return true;

    // Start by making the form check the native elements it knows about.
    var valid = this._form.checkValidity();
    var elements = this._getValidatableElements();

    // Go through all the elements, and validate the custom ones.
    for (var el, i = 0; el = elements[i], i < elements.length; i++) {
      // This is weird to appease the compiler. We assume the custom element
      // has a validate() method, otherwise we can't check it.
      var validatable = /** @type {{validate: (function() : boolean)}} */ (el);
      if (validatable.validate) {
        valid = !!validatable.validate() && valid;
      }
    }
    return valid;
  },

  /**
   * Submits the form.
   */
  submit: function(event) {
    // We are not using this form for submission, so always cancel its event.
    if (event) {
      event.preventDefault();
    }

    // If you've called this before distribution happened, bail out.
    if (!this._form) {
      return;
    }

    if (!this.validate()) {
      this.fire('iron-form-invalid');
      return;
    }

    // Remove any existing children in the submission form (from a previous submit).
    this.$.helper.textContent = '';

    var json = this.serializeForm();

    // If we want a redirect, submit the form natively.
    if (this.allowRedirect) {
      // If we're submitting the form natively, then create a hidden element for
      // each of the values.
      for (element in json) {
        this.$.helper.appendChild(this._createHiddenElement(element, json[element]));
      }

      // Copy the original form attributes.
      this.$.helper.action = this._form.getAttribute('action');
      this.$.helper.method = this._form.getAttribute('method') || 'GET';
      this.$.helper.contentType = this._form.getAttribute('enctype');

      this.$.helper.submit();
      this.fire('iron-form-submit');
    } else {
      this._makeAjaxRequest(json);
    }
  },

  /**
   * Resets the form to the default values.
   */
  reset: function(event) {
    // We are not using this form for submission, so always cancel its event.
    if (event)
      event.preventDefault();

    // If you've called this before distribution happened, bail out.
    if (!this._form) {
      return;
    }

    // Load the initial values.
    var nodes = this._getSubmittableElements();
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (this._defaults.has(node)) {
        var defaults = this._defaults.get(node);
        node.value = defaults.value;
        node.checked = defaults.checked;
      }
    }
  },

  /**
   * Serializes the form as will be used in submission. Note that `serialize`
   * is a Polymer reserved keyword, so calling `someIronForm`.serialize()`
   * will give you unexpected results.
   * @return {Object} An object containing name-value pairs for elements that
   *                  would be submitted.
   */
  serializeForm: function() {
    // Only elements that have a `name` and are not disabled are submittable.
    var elements = this._getSubmittableElements();
    var json = {};
    for (var i = 0; i < elements.length; i++) {
      var values = this._serializeElementValues(elements[i]);
      for (var v = 0; v < values.length; v++) {
        this._addSerializedElement(json, elements[i].name, values[v]);
      }
    }
    return json;
  },

  _handleFormResponse: function (event) {
    this.fire('iron-form-response', event.detail);
  },

  _handleFormError: function (event) {
    this.fire('iron-form-error', event.detail);
  },

  _makeAjaxRequest: function(json) {
    // Initialize the iron-ajax element if we haven't already.
    if (!this.request) {
      this.request = document.createElement('iron-ajax');
      this.request.addEventListener('response', this._handleFormResponse.bind(this));
      this.request.addEventListener('error', this._handleFormError.bind(this));
    }

    // Native forms can also index elements magically by their name (can't make
    // this up if I tried) so we need to get the correct attributes, not the
    // elements with those names.
    this.request.url = this._form.getAttribute('action');
    this.request.method = this._form.getAttribute('method') || 'GET';
    this.request.contentType = this._form.getAttribute('enctype');
    this.request.withCredentials = this.withCredentials;
    this.request.headers = this.headers;

    if (this._form.method.toUpperCase() === 'POST') {
      this.request.body = json;
    } else {
      this.request.params = json;
    }

    // Allow for a presubmit hook
    var event = this.fire('iron-form-presubmit', {}, {cancelable: true});
    if(!event.defaultPrevented) {
      this.request.generateRequest();
      this.fire('iron-form-submit', json);
    }
  },

  _getValidatableElements: function() {
    return this._findElements(this._form, true);
  },

  _getSubmittableElements: function() {
    return this._findElements(this._form, false);
  },

  _findElements: function(parent, ignoreName) {
    var nodes = dom(parent).querySelectorAll('*');
    var submittable = [];

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      // An element is submittable if it is not disabled, and if it has a
      // 'name' attribute.
      if(!node.disabled && (ignoreName || node.name)) {
        submittable.push(node);
      }
      else {
        // This element has a root which could contain more submittable elements.
        if(node.root) {
          Array.prototype.push.apply(submittable, this._findElements(node.root, ignoreName));
        }
      }
    }
    return submittable;
  },

  _serializeElementValues: function(element) {
    // We will assume that every custom element that needs to be serialized
    // has a `value` property, and it contains the correct value.
    // The only weird one is an element that implements IronCheckedElementBehaviour,
    // in which case like the native checkbox/radio button, it's only used
    // when checked.
    // For native elements, from https://www.w3.org/TR/html5/forms.html#the-form-element.
    // Native submittable elements: button, input, keygen, object, select, textarea;
    // 1. We will skip `keygen and `object` for this iteration, and deal with
    // them if they're actually required.
    // 2. <button> and <textarea> have a `value` property, so they behave like
    //    the custom elements.
    // 3. <select> can have multiple options selected, in which case its
    //    `value` is incorrect, and we must use the values of each of its
    //    `selectedOptions`
    // 4. <input> can have a whole bunch of behaviours, so it's handled separately.
    // 5. Buttons are hard. The button that was clicked to submit the form
    //    is the one who's name/value gets sent to the server.
    var tag = element.tagName.toLowerCase();
    if (tag === 'button' || (tag === 'input' && (element.type === 'submit' || element.type === 'reset'))) {
      return [];
    }

    if (tag === 'select') {
      return this._serializeSelectValues(element);
    } else if (tag === 'input') {
      return this._serializeInputValues(element);
    } else {
      if (element['_hasIronCheckedElementBehavior'] && !element.checked)
        return [];
      return [element.value];
    }
  },

  _serializeSelectValues: function(element) {
    var values = [];

    // A <select multiple> has an array of options, some of which can be selected.
    for (var i = 0; i < element.options.length; i++) {
      if (element.options[i].selected) {
        values.push(element.options[i].value)
      }
    }
    return values;
  },

  _serializeInputValues: function(element) {
    // Most of the inputs use their 'value' attribute, with the exception
    // of radio buttons, checkboxes and file.
    var type = element.type.toLowerCase();

    // Don't do anything for unchecked checkboxes/radio buttons.
    // Don't do anything for file, since that requires a different request.
    if (((type === 'checkbox' || type === 'radio') && !element.checked) ||
        type === 'file') {
      return [];
    }
    return [element.value];
  },

  _createHiddenElement: function(name, value) {
    var input = document.createElement("input");
    input.setAttribute("type", "hidden");
    input.setAttribute("name", name);
    input.setAttribute("value", value);
    return input;
  },

  _addSerializedElement: function(json, name, value) {
    // If the name doesn't exist, add it. Otherwise, serialize it to
    // an array,
    if (json[name] === undefined) {
      json[name] = value;
    } else {
      if (!Array.isArray(json[name])) {
        json[name] = [json[name]];
      }
      json[name].push(value);
    }
  }
});
