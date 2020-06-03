import { Base, IronOverlayBehavior, IronOverlayBehaviorImpl, dom, Polymer, html$1 as html, NeonAnimationRunnerBehavior, IronA11yAnnouncer } from './shared_bundle_1.js';
/// BareSpecifier=@polymer\iron-range-behavior\iron-range-behavior
const IronRangeBehavior = {
  properties: {
    /**
     * The number that represents the current value.
     */value: {
      type: Number,
      value: 0,
      notify: true,
      reflectToAttribute: true
    },
    /**
     * The number that indicates the minimum value of the range.
     */min: {
      type: Number,
      value: 0,
      notify: true
    },
    /**
     * The number that indicates the maximum value of the range.
     */max: {
      type: Number,
      value: 100,
      notify: true
    },
    /**
     * Specifies the value granularity of the range's value.
     */step: {
      type: Number,
      value: 1,
      notify: true
    },
    /**
     * Returns the ratio of the value.
     */ratio: {
      type: Number,
      value: 0,
      readOnly: true,
      notify: true
    }
  },
  observers: ['_update(value, min, max, step)'],
  _calcRatio: function (value) {
    return (this._clampValue(value) - this.min) / (this.max - this.min);
  },
  _clampValue: function (value) {
    return Math.min(this.max, Math.max(this.min, this._calcStep(value)));
  },
  _calcStep: function (value) {
    // polymer/issues/2493
    value = parseFloat(value);

    if (!this.step) {
      return value;
    }

    var numSteps = Math.round((value - this.min) / this.step);

    if (this.step < 1) {
      /**
       * For small values of this.step, if we calculate the step using
       * `Math.round(value / step) * step` we may hit a precision point issue
       * eg. 0.1 * 0.2 =  0.020000000000000004
       * http://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html
       *
       * as a work around we can divide by the reciprocal of `step`
       */return numSteps / (1 / this.step) + this.min;
    } else {
      return numSteps * this.step + this.min;
    }
  },
  _validateValue: function () {
    var v = this._clampValue(this.value);

    this.value = this.oldValue = isNaN(v) ? this.oldValue : v;
    return this.value !== v;
  },
  _update: function () {
    this._validateValue();

    this._setRatio(this._calcRatio(this.value) * 100);
  }
};
var ironRangeBehavior = {
  IronRangeBehavior: IronRangeBehavior
}; /// BareSpecifier=@polymer\paper-dialog-behavior\paper-dialog-behavior

const PaperDialogBehaviorImpl = {
  hostAttributes: {
    'role': 'dialog',
    'tabindex': '-1'
  },
  properties: {
    /**
     * If `modal` is true, this implies `no-cancel-on-outside-click`,
     * `no-cancel-on-esc-key` and `with-backdrop`.
     */modal: {
      type: Boolean,
      value: false
    },
    __readied: {
      type: Boolean,
      value: false
    }
  },
  observers: ['_modalChanged(modal, __readied)'],
  listeners: {
    'tap': '_onDialogClick'
  },
  /**
   * @return {void}
   */ready: function () {
    // Only now these properties can be read.
    this.__prevNoCancelOnOutsideClick = this.noCancelOnOutsideClick;
    this.__prevNoCancelOnEscKey = this.noCancelOnEscKey;
    this.__prevWithBackdrop = this.withBackdrop;
    this.__readied = true;
  },
  _modalChanged: function (modal, readied) {
    // modal implies noCancelOnOutsideClick, noCancelOnEscKey and withBackdrop.
    // We need to wait for the element to be ready before we can read the
    // properties values.
    if (!readied) {
      return;
    }

    if (modal) {
      this.__prevNoCancelOnOutsideClick = this.noCancelOnOutsideClick;
      this.__prevNoCancelOnEscKey = this.noCancelOnEscKey;
      this.__prevWithBackdrop = this.withBackdrop;
      this.noCancelOnOutsideClick = true;
      this.noCancelOnEscKey = true;
      this.withBackdrop = true;
    } else {
      // If the value was changed to false, let it false.
      this.noCancelOnOutsideClick = this.noCancelOnOutsideClick && this.__prevNoCancelOnOutsideClick;
      this.noCancelOnEscKey = this.noCancelOnEscKey && this.__prevNoCancelOnEscKey;
      this.withBackdrop = this.withBackdrop && this.__prevWithBackdrop;
    }
  },
  _updateClosingReasonConfirmed: function (confirmed) {
    this.closingReason = this.closingReason || {};
    this.closingReason.confirmed = confirmed;
  },
  /**
   * Will dismiss the dialog if user clicked on an element with dialog-dismiss
   * or dialog-confirm attribute.
   */_onDialogClick: function (event) {
    // Search for the element with dialog-confirm or dialog-dismiss,
    // from the root target until this (excluded).
    var path = dom(event).path;

    for (var i = 0, l = path.indexOf(this); i < l; i++) {
      var target = path[i];

      if (target.hasAttribute && (target.hasAttribute('dialog-dismiss') || target.hasAttribute('dialog-confirm'))) {
        this._updateClosingReasonConfirmed(target.hasAttribute('dialog-confirm'));

        this.close();
        event.stopPropagation();
        break;
      }
    }
  }
}; /** @polymerBehavior */
const PaperDialogBehavior = [IronOverlayBehavior, PaperDialogBehaviorImpl];
var paperDialogBehavior = {
  PaperDialogBehaviorImpl: PaperDialogBehaviorImpl,
  PaperDialogBehavior: PaperDialogBehavior
}; /// BareSpecifier=@polymer\paper-dialog-behavior\paper-dialog-shared-styles

const $_documentContainer = document.createElement('template');
$_documentContainer.setAttribute('style', 'display: none;');
$_documentContainer.innerHTML = `<dom-module id="paper-dialog-shared-styles">
  <template>
    <style>
      :host {
        display: block;
        margin: 24px 40px;

        background: var(--paper-dialog-background-color, var(--primary-background-color));
        color: var(--paper-dialog-color, var(--primary-text-color));

        @apply --paper-font-body1;
        @apply --shadow-elevation-16dp;
        @apply --paper-dialog;
      }

      :host > ::slotted(*) {
        margin-top: 20px;
        padding: 0 24px;
      }

      :host > ::slotted(.no-padding) {
        padding: 0;
      }

      
      :host > ::slotted(*:first-child) {
        margin-top: 24px;
      }

      :host > ::slotted(*:last-child) {
        margin-bottom: 24px;
      }

      /* In 1.x, this selector was \`:host > ::content h2\`. In 2.x <slot> allows
      to select direct children only, which increases the weight of this
      selector, so we have to re-define first-child/last-child margins below. */
      :host > ::slotted(h2) {
        position: relative;
        margin: 0;

        @apply --paper-font-title;
        @apply --paper-dialog-title;
      }

      /* Apply mixin again, in case it sets margin-top. */
      :host > ::slotted(h2:first-child) {
        margin-top: 24px;
        @apply --paper-dialog-title;
      }

      /* Apply mixin again, in case it sets margin-bottom. */
      :host > ::slotted(h2:last-child) {
        margin-bottom: 24px;
        @apply --paper-dialog-title;
      }

      :host > ::slotted(.paper-dialog-buttons),
      :host > ::slotted(.buttons) {
        position: relative;
        padding: 8px 8px 8px 24px;
        margin: 0;

        color: var(--paper-dialog-button-color, var(--primary-color));

        @apply --layout-horizontal;
        @apply --layout-end-justified;
      }
    </style>
  </template>
</dom-module>`;
document.head.appendChild($_documentContainer.content); /// BareSpecifier=@polymer\paper-dialog-scrollable\paper-dialog-scrollable

Polymer({
  _template: html`
    <style>

      :host {
        display: block;
        @apply --layout-relative;
      }

      :host(.is-scrolled:not(:first-child))::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--divider-color);
      }

      :host(.can-scroll:not(.scrolled-to-bottom):not(:last-child))::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: var(--divider-color);
      }

      .scrollable {
        padding: 0 24px;

        @apply --layout-scroll;
        @apply --paper-dialog-scrollable;
      }

      .fit {
        @apply --layout-fit;
      }
    </style>

    <div id="scrollable" class="scrollable" on-scroll="updateScrollState">
      <slot></slot>
    </div>
`,
  is: 'paper-dialog-scrollable',
  properties: {
    /**
     * The dialog element that implements `Polymer.PaperDialogBehavior`
     * containing this element.
     * @type {?Node}
     */dialogElement: {
      type: Object
    }
  },

  /**
   * Returns the scrolling element.
   */get scrollTarget() {
    return this.$.scrollable;
  },

  ready: function () {
    this._ensureTarget();

    this.classList.add('no-padding');
  },
  attached: function () {
    this._ensureTarget();

    requestAnimationFrame(this.updateScrollState.bind(this));
  },
  updateScrollState: function () {
    this.toggleClass('is-scrolled', this.scrollTarget.scrollTop > 0);
    this.toggleClass('can-scroll', this.scrollTarget.offsetHeight < this.scrollTarget.scrollHeight);
    this.toggleClass('scrolled-to-bottom', this.scrollTarget.scrollTop + this.scrollTarget.offsetHeight >= this.scrollTarget.scrollHeight);
  },
  _ensureTarget: function () {
    // Read parentElement instead of parentNode in order to skip shadowRoots.
    this.dialogElement = this.dialogElement || this.parentElement; // Check if dialog implements paper-dialog-behavior. If not, fit
    // scrollTarget to host.

    if (this.dialogElement && this.dialogElement.behaviors && this.dialogElement.behaviors.indexOf(PaperDialogBehaviorImpl) >= 0) {
      this.dialogElement.sizingTarget = this.scrollTarget;
      this.scrollTarget.classList.remove('fit');
    } else if (this.dialogElement) {
      this.scrollTarget.classList.add('fit');
    }
  }
}); /// BareSpecifier=@polymer\paper-dialog\paper-dialog

Polymer({
  _template: html`
    <style include="paper-dialog-shared-styles"></style>
    <slot></slot>
`,
  is: 'paper-dialog',
  behaviors: [PaperDialogBehavior, NeonAnimationRunnerBehavior],
  listeners: {
    'neon-animation-finish': '_onNeonAnimationFinish'
  },
  _renderOpened: function () {
    this.cancelAnimation();
    this.playAnimation('entry');
  },
  _renderClosed: function () {
    this.cancelAnimation();
    this.playAnimation('exit');
  },
  _onNeonAnimationFinish: function () {
    if (this.opened) {
      this._finishRenderOpened();
    } else {
      this._finishRenderClosed();
    }
  }
}); /// BareSpecifier=@polymer\paper-progress\paper-progress

Polymer({
  _template: html`
    <style>
      :host {
        display: block;
        width: 200px;
        position: relative;
        overflow: hidden;
      }

      :host([hidden]), [hidden] {
        display: none !important;
      }

      #progressContainer {
        @apply --paper-progress-container;
        position: relative;
      }

      #progressContainer,
      /* the stripe for the indeterminate animation*/
      .indeterminate::after {
        height: var(--paper-progress-height, 4px);
      }

      #primaryProgress,
      #secondaryProgress,
      .indeterminate::after {
        @apply --layout-fit;
      }

      #progressContainer,
      .indeterminate::after {
        background: var(--paper-progress-container-color, var(--google-grey-300));
      }

      :host(.transiting) #primaryProgress,
      :host(.transiting) #secondaryProgress {
        -webkit-transition-property: -webkit-transform;
        transition-property: transform;

        /* Duration */
        -webkit-transition-duration: var(--paper-progress-transition-duration, 0.08s);
        transition-duration: var(--paper-progress-transition-duration, 0.08s);

        /* Timing function */
        -webkit-transition-timing-function: var(--paper-progress-transition-timing-function, ease);
        transition-timing-function: var(--paper-progress-transition-timing-function, ease);

        /* Delay */
        -webkit-transition-delay: var(--paper-progress-transition-delay, 0s);
        transition-delay: var(--paper-progress-transition-delay, 0s);
      }

      #primaryProgress,
      #secondaryProgress {
        @apply --layout-fit;
        -webkit-transform-origin: left center;
        transform-origin: left center;
        -webkit-transform: scaleX(0);
        transform: scaleX(0);
        will-change: transform;
      }

      #primaryProgress {
        background: var(--paper-progress-active-color, var(--google-green-500));
      }

      #secondaryProgress {
        background: var(--paper-progress-secondary-color, var(--google-green-100));
      }

      :host([disabled]) #primaryProgress {
        background: var(--paper-progress-disabled-active-color, var(--google-grey-500));
      }

      :host([disabled]) #secondaryProgress {
        background: var(--paper-progress-disabled-secondary-color, var(--google-grey-300));
      }

      :host(:not([disabled])) #primaryProgress.indeterminate {
        -webkit-transform-origin: right center;
        transform-origin: right center;
        -webkit-animation: indeterminate-bar var(--paper-progress-indeterminate-cycle-duration, 2s) linear infinite;
        animation: indeterminate-bar var(--paper-progress-indeterminate-cycle-duration, 2s) linear infinite;
      }

      :host(:not([disabled])) #primaryProgress.indeterminate::after {
        content: "";
        -webkit-transform-origin: center center;
        transform-origin: center center;

        -webkit-animation: indeterminate-splitter var(--paper-progress-indeterminate-cycle-duration, 2s) linear infinite;
        animation: indeterminate-splitter var(--paper-progress-indeterminate-cycle-duration, 2s) linear infinite;
      }

      @-webkit-keyframes indeterminate-bar {
        0% {
          -webkit-transform: scaleX(1) translateX(-100%);
        }
        50% {
          -webkit-transform: scaleX(1) translateX(0%);
        }
        75% {
          -webkit-transform: scaleX(1) translateX(0%);
          -webkit-animation-timing-function: cubic-bezier(.28,.62,.37,.91);
        }
        100% {
          -webkit-transform: scaleX(0) translateX(0%);
        }
      }

      @-webkit-keyframes indeterminate-splitter {
        0% {
          -webkit-transform: scaleX(.75) translateX(-125%);
        }
        30% {
          -webkit-transform: scaleX(.75) translateX(-125%);
          -webkit-animation-timing-function: cubic-bezier(.42,0,.6,.8);
        }
        90% {
          -webkit-transform: scaleX(.75) translateX(125%);
        }
        100% {
          -webkit-transform: scaleX(.75) translateX(125%);
        }
      }

      @keyframes indeterminate-bar {
        0% {
          transform: scaleX(1) translateX(-100%);
        }
        50% {
          transform: scaleX(1) translateX(0%);
        }
        75% {
          transform: scaleX(1) translateX(0%);
          animation-timing-function: cubic-bezier(.28,.62,.37,.91);
        }
        100% {
          transform: scaleX(0) translateX(0%);
        }
      }

      @keyframes indeterminate-splitter {
        0% {
          transform: scaleX(.75) translateX(-125%);
        }
        30% {
          transform: scaleX(.75) translateX(-125%);
          animation-timing-function: cubic-bezier(.42,0,.6,.8);
        }
        90% {
          transform: scaleX(.75) translateX(125%);
        }
        100% {
          transform: scaleX(.75) translateX(125%);
        }
      }
    </style>

    <div id="progressContainer">
      <div id="secondaryProgress" hidden\$="[[_hideSecondaryProgress(secondaryRatio)]]"></div>
      <div id="primaryProgress"></div>
    </div>
`,
  is: 'paper-progress',
  behaviors: [IronRangeBehavior],
  properties: {
    /**
     * The number that represents the current secondary progress.
     */secondaryProgress: {
      type: Number,
      value: 0
    },
    /**
     * The secondary ratio
     */secondaryRatio: {
      type: Number,
      value: 0,
      readOnly: true
    },
    /**
     * Use an indeterminate progress indicator.
     */indeterminate: {
      type: Boolean,
      value: false,
      observer: '_toggleIndeterminate'
    },
    /**
     * True if the progress is disabled.
     */disabled: {
      type: Boolean,
      value: false,
      reflectToAttribute: true,
      observer: '_disabledChanged'
    }
  },
  observers: ['_progressChanged(secondaryProgress, value, min, max, indeterminate)'],
  hostAttributes: {
    role: 'progressbar'
  },
  _toggleIndeterminate: function (indeterminate) {
    // If we use attribute/class binding, the animation sometimes doesn't
    // translate properly on Safari 7.1. So instead, we toggle the class here in
    // the update method.
    this.toggleClass('indeterminate', indeterminate, this.$.primaryProgress);
  },
  _transformProgress: function (progress, ratio) {
    var transform = 'scaleX(' + ratio / 100 + ')';
    progress.style.transform = progress.style.webkitTransform = transform;
  },
  _mainRatioChanged: function (ratio) {
    this._transformProgress(this.$.primaryProgress, ratio);
  },
  _progressChanged: function (secondaryProgress, value, min, max, indeterminate) {
    secondaryProgress = this._clampValue(secondaryProgress);
    value = this._clampValue(value);
    var secondaryRatio = this._calcRatio(secondaryProgress) * 100;
    var mainRatio = this._calcRatio(value) * 100;

    this._setSecondaryRatio(secondaryRatio);

    this._transformProgress(this.$.secondaryProgress, secondaryRatio);

    this._transformProgress(this.$.primaryProgress, mainRatio);

    this.secondaryProgress = secondaryProgress;

    if (indeterminate) {
      this.removeAttribute('aria-valuenow');
    } else {
      this.setAttribute('aria-valuenow', value);
    }

    this.setAttribute('aria-valuemin', min);
    this.setAttribute('aria-valuemax', max);
  },
  _disabledChanged: function (disabled) {
    this.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  },
  _hideSecondaryProgress: function (secondaryRatio) {
    return secondaryRatio === 0;
  }
}); /// BareSpecifier=@polymer\paper-spinner\paper-spinner-behavior

const PaperSpinnerBehavior = {
  properties: {
    /**
     * Displays the spinner.
     */active: {
      type: Boolean,
      value: false,
      reflectToAttribute: true,
      observer: '__activeChanged'
    },
    /**
     * Alternative text content for accessibility support.
     * If alt is present, it will add an aria-label whose content matches alt
     * when active. If alt is not present, it will default to 'loading' as the
     * alt value.
     */alt: {
      type: String,
      value: 'loading',
      observer: '__altChanged'
    },
    __coolingDown: {
      type: Boolean,
      value: false
    }
  },
  __computeContainerClasses: function (active, coolingDown) {
    return [active || coolingDown ? 'active' : '', coolingDown ? 'cooldown' : ''].join(' ');
  },
  __activeChanged: function (active, old) {
    this.__setAriaHidden(!active);

    this.__coolingDown = !active && old;
  },
  __altChanged: function (alt) {
    // user-provided `aria-label` takes precedence over prototype default
    if (alt === 'loading') {
      this.alt = this.getAttribute('aria-label') || alt;
    } else {
      this.__setAriaHidden(alt === '');

      this.setAttribute('aria-label', alt);
    }
  },
  __setAriaHidden: function (hidden) {
    var attr = 'aria-hidden';

    if (hidden) {
      this.setAttribute(attr, 'true');
    } else {
      this.removeAttribute(attr);
    }
  },
  __reset: function () {
    this.active = false;
    this.__coolingDown = false;
  }
};
var paperSpinnerBehavior = {
  PaperSpinnerBehavior: PaperSpinnerBehavior
}; /// BareSpecifier=@polymer\paper-spinner\paper-spinner-styles
/**
@license
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/
const $_documentContainer$1 = document.createElement('template');
$_documentContainer$1.setAttribute('style', 'display: none;');
$_documentContainer$1.innerHTML = `<dom-module id="paper-spinner-styles">
  <template>
    <style>
      /*
      /**************************/
      /* STYLES FOR THE SPINNER */
      /**************************/

      /*
       * Constants:
       *      ARCSIZE     = 270 degrees (amount of circle the arc takes up)
       *      ARCTIME     = 1333ms (time it takes to expand and contract arc)
       *      ARCSTARTROT = 216 degrees (how much the start location of the arc
       *                                should rotate each time, 216 gives us a
       *                                5 pointed star shape (it's 360/5 * 3).
       *                                For a 7 pointed star, we might do
       *                                360/7 * 3 = 154.286)
       *      SHRINK_TIME = 400ms
       */

      :host {
        display: inline-block;
        position: relative;
        width: 28px;
        height: 28px;

        /* 360 * ARCTIME / (ARCSTARTROT + (360-ARCSIZE)) */
        --paper-spinner-container-rotation-duration: 1568ms;

        /* ARCTIME */
        --paper-spinner-expand-contract-duration: 1333ms;

        /* 4 * ARCTIME */
        --paper-spinner-full-cycle-duration: 5332ms;

        /* SHRINK_TIME */
        --paper-spinner-cooldown-duration: 400ms;
      }

      #spinnerContainer {
        width: 100%;
        height: 100%;

        /* The spinner does not have any contents that would have to be
         * flipped if the direction changes. Always use ltr so that the
         * style works out correctly in both cases. */
        direction: ltr;
      }

      #spinnerContainer.active {
        -webkit-animation: container-rotate var(--paper-spinner-container-rotation-duration) linear infinite;
        animation: container-rotate var(--paper-spinner-container-rotation-duration) linear infinite;
      }

      @-webkit-keyframes container-rotate {
        to { -webkit-transform: rotate(360deg) }
      }

      @keyframes container-rotate {
        to { transform: rotate(360deg) }
      }

      .spinner-layer {
        position: absolute;
        width: 100%;
        height: 100%;
        opacity: 0;
        white-space: nowrap;
        color: var(--paper-spinner-color, var(--google-blue-500));
      }

      .layer-1 {
        color: var(--paper-spinner-layer-1-color, var(--google-blue-500));
      }

      .layer-2 {
        color: var(--paper-spinner-layer-2-color, var(--google-red-500));
      }

      .layer-3 {
        color: var(--paper-spinner-layer-3-color, var(--google-yellow-500));
      }

      .layer-4 {
        color: var(--paper-spinner-layer-4-color, var(--google-green-500));
      }

      /**
       * IMPORTANT NOTE ABOUT CSS ANIMATION PROPERTIES (keanulee):
       *
       * iOS Safari (tested on iOS 8.1) does not handle animation-delay very well - it doesn't
       * guarantee that the animation will start _exactly_ after that value. So we avoid using
       * animation-delay and instead set custom keyframes for each color (as layer-2undant as it
       * seems).
       */
      .active .spinner-layer {
        -webkit-animation-name: fill-unfill-rotate;
        -webkit-animation-duration: var(--paper-spinner-full-cycle-duration);
        -webkit-animation-timing-function: cubic-bezier(0.4, 0.0, 0.2, 1);
        -webkit-animation-iteration-count: infinite;
        animation-name: fill-unfill-rotate;
        animation-duration: var(--paper-spinner-full-cycle-duration);
        animation-timing-function: cubic-bezier(0.4, 0.0, 0.2, 1);
        animation-iteration-count: infinite;
        opacity: 1;
      }

      .active .spinner-layer.layer-1 {
        -webkit-animation-name: fill-unfill-rotate, layer-1-fade-in-out;
        animation-name: fill-unfill-rotate, layer-1-fade-in-out;
      }

      .active .spinner-layer.layer-2 {
        -webkit-animation-name: fill-unfill-rotate, layer-2-fade-in-out;
        animation-name: fill-unfill-rotate, layer-2-fade-in-out;
      }

      .active .spinner-layer.layer-3 {
        -webkit-animation-name: fill-unfill-rotate, layer-3-fade-in-out;
        animation-name: fill-unfill-rotate, layer-3-fade-in-out;
      }

      .active .spinner-layer.layer-4 {
        -webkit-animation-name: fill-unfill-rotate, layer-4-fade-in-out;
        animation-name: fill-unfill-rotate, layer-4-fade-in-out;
      }

      @-webkit-keyframes fill-unfill-rotate {
        12.5% { -webkit-transform: rotate(135deg) } /* 0.5 * ARCSIZE */
        25%   { -webkit-transform: rotate(270deg) } /* 1   * ARCSIZE */
        37.5% { -webkit-transform: rotate(405deg) } /* 1.5 * ARCSIZE */
        50%   { -webkit-transform: rotate(540deg) } /* 2   * ARCSIZE */
        62.5% { -webkit-transform: rotate(675deg) } /* 2.5 * ARCSIZE */
        75%   { -webkit-transform: rotate(810deg) } /* 3   * ARCSIZE */
        87.5% { -webkit-transform: rotate(945deg) } /* 3.5 * ARCSIZE */
        to    { -webkit-transform: rotate(1080deg) } /* 4   * ARCSIZE */
      }

      @keyframes fill-unfill-rotate {
        12.5% { transform: rotate(135deg) } /* 0.5 * ARCSIZE */
        25%   { transform: rotate(270deg) } /* 1   * ARCSIZE */
        37.5% { transform: rotate(405deg) } /* 1.5 * ARCSIZE */
        50%   { transform: rotate(540deg) } /* 2   * ARCSIZE */
        62.5% { transform: rotate(675deg) } /* 2.5 * ARCSIZE */
        75%   { transform: rotate(810deg) } /* 3   * ARCSIZE */
        87.5% { transform: rotate(945deg) } /* 3.5 * ARCSIZE */
        to    { transform: rotate(1080deg) } /* 4   * ARCSIZE */
      }

      @-webkit-keyframes layer-1-fade-in-out {
        0% { opacity: 1 }
        25% { opacity: 1 }
        26% { opacity: 0 }
        89% { opacity: 0 }
        90% { opacity: 1 }
        to { opacity: 1 }
      }

      @keyframes layer-1-fade-in-out {
        0% { opacity: 1 }
        25% { opacity: 1 }
        26% { opacity: 0 }
        89% { opacity: 0 }
        90% { opacity: 1 }
        to { opacity: 1 }
      }

      @-webkit-keyframes layer-2-fade-in-out {
        0% { opacity: 0 }
        15% { opacity: 0 }
        25% { opacity: 1 }
        50% { opacity: 1 }
        51% { opacity: 0 }
        to { opacity: 0 }
      }

      @keyframes layer-2-fade-in-out {
        0% { opacity: 0 }
        15% { opacity: 0 }
        25% { opacity: 1 }
        50% { opacity: 1 }
        51% { opacity: 0 }
        to { opacity: 0 }
      }

      @-webkit-keyframes layer-3-fade-in-out {
        0% { opacity: 0 }
        40% { opacity: 0 }
        50% { opacity: 1 }
        75% { opacity: 1 }
        76% { opacity: 0 }
        to { opacity: 0 }
      }

      @keyframes layer-3-fade-in-out {
        0% { opacity: 0 }
        40% { opacity: 0 }
        50% { opacity: 1 }
        75% { opacity: 1 }
        76% { opacity: 0 }
        to { opacity: 0 }
      }

      @-webkit-keyframes layer-4-fade-in-out {
        0% { opacity: 0 }
        65% { opacity: 0 }
        75% { opacity: 1 }
        90% { opacity: 1 }
        to { opacity: 0 }
      }

      @keyframes layer-4-fade-in-out {
        0% { opacity: 0 }
        65% { opacity: 0 }
        75% { opacity: 1 }
        90% { opacity: 1 }
        to { opacity: 0 }
      }

      .circle-clipper {
        display: inline-block;
        position: relative;
        width: 50%;
        height: 100%;
        overflow: hidden;
      }

      /**
       * Patch the gap that appear between the two adjacent div.circle-clipper while the
       * spinner is rotating (appears on Chrome 50, Safari 9.1.1, and Edge).
       */
      .spinner-layer::after {
        left: 45%;
        width: 10%;
        border-top-style: solid;
      }

      .spinner-layer::after,
      .circle-clipper::after {
        content: '';
        box-sizing: border-box;
        position: absolute;
        top: 0;
        border-width: var(--paper-spinner-stroke-width, 3px);
        border-radius: 50%;
      }

      .circle-clipper::after {
        bottom: 0;
        width: 200%;
        border-style: solid;
        border-bottom-color: transparent !important;
      }

      .circle-clipper.left::after {
        left: 0;
        border-right-color: transparent !important;
        -webkit-transform: rotate(129deg);
        transform: rotate(129deg);
      }

      .circle-clipper.right::after {
        left: -100%;
        border-left-color: transparent !important;
        -webkit-transform: rotate(-129deg);
        transform: rotate(-129deg);
      }

      .active .gap-patch::after,
      .active .circle-clipper::after {
        -webkit-animation-duration: var(--paper-spinner-expand-contract-duration);
        -webkit-animation-timing-function: cubic-bezier(0.4, 0.0, 0.2, 1);
        -webkit-animation-iteration-count: infinite;
        animation-duration: var(--paper-spinner-expand-contract-duration);
        animation-timing-function: cubic-bezier(0.4, 0.0, 0.2, 1);
        animation-iteration-count: infinite;
      }

      .active .circle-clipper.left::after {
        -webkit-animation-name: left-spin;
        animation-name: left-spin;
      }

      .active .circle-clipper.right::after {
        -webkit-animation-name: right-spin;
        animation-name: right-spin;
      }

      @-webkit-keyframes left-spin {
        0% { -webkit-transform: rotate(130deg) }
        50% { -webkit-transform: rotate(-5deg) }
        to { -webkit-transform: rotate(130deg) }
      }

      @keyframes left-spin {
        0% { transform: rotate(130deg) }
        50% { transform: rotate(-5deg) }
        to { transform: rotate(130deg) }
      }

      @-webkit-keyframes right-spin {
        0% { -webkit-transform: rotate(-130deg) }
        50% { -webkit-transform: rotate(5deg) }
        to { -webkit-transform: rotate(-130deg) }
      }

      @keyframes right-spin {
        0% { transform: rotate(-130deg) }
        50% { transform: rotate(5deg) }
        to { transform: rotate(-130deg) }
      }

      #spinnerContainer.cooldown {
        -webkit-animation: container-rotate var(--paper-spinner-container-rotation-duration) linear infinite, fade-out var(--paper-spinner-cooldown-duration) cubic-bezier(0.4, 0.0, 0.2, 1);
        animation: container-rotate var(--paper-spinner-container-rotation-duration) linear infinite, fade-out var(--paper-spinner-cooldown-duration) cubic-bezier(0.4, 0.0, 0.2, 1);
      }

      @-webkit-keyframes fade-out {
        0% { opacity: 1 }
        to { opacity: 0 }
      }

      @keyframes fade-out {
        0% { opacity: 1 }
        to { opacity: 0 }
      }
    </style>
  </template>
</dom-module>`;
document.head.appendChild($_documentContainer$1.content); /// BareSpecifier=@polymer\paper-spinner\paper-spinner

const template = html`
  <style include="paper-spinner-styles"></style>

  <div id="spinnerContainer" class-name="[[__computeContainerClasses(active, __coolingDown)]]" on-animationend="__reset" on-webkit-animation-end="__reset">
    <div class="spinner-layer layer-1">
      <div class="circle-clipper left"></div>
      <div class="circle-clipper right"></div>
    </div>

    <div class="spinner-layer layer-2">
      <div class="circle-clipper left"></div>
      <div class="circle-clipper right"></div>
    </div>

    <div class="spinner-layer layer-3">
      <div class="circle-clipper left"></div>
      <div class="circle-clipper right"></div>
    </div>

    <div class="spinner-layer layer-4">
      <div class="circle-clipper left"></div>
      <div class="circle-clipper right"></div>
    </div>
  </div>
`;
template.setAttribute('strip-whitespace', ''); /**
                                               Material design: [Progress &
                                               activity](https://www.google.com/design/spec/components/progress-activity.html)
                                               
                                               Element providing a multiple color material design circular spinner.
                                               
                                                   <paper-spinner active></paper-spinner>
                                               
                                               The default spinner cycles between four layers of colors; by default they are
                                               blue, red, yellow and green. It can be customized to cycle between four
                                               different colors. Use <paper-spinner-lite> for single color spinners.
                                               
                                               ### Accessibility
                                               
                                               Alt attribute should be set to provide adequate context for accessibility. If
                                               not provided, it defaults to 'loading'. Empty alt can be provided to mark the
                                               element as decorative if alternative content is provided in another form (e.g. a
                                               text block following the spinner).
                                               
                                                   <paper-spinner alt="Loading contacts list" active></paper-spinner>
                                               
                                               ### Styling
                                               
                                               The following custom properties and mixins are available for styling:
                                               
                                               Custom property | Description | Default
                                               ----------------|-------------|----------
                                               `--paper-spinner-layer-1-color` | Color of the first spinner rotation | `--google-blue-500`
                                               `--paper-spinner-layer-2-color` | Color of the second spinner rotation | `--google-red-500`
                                               `--paper-spinner-layer-3-color` | Color of the third spinner rotation | `--google-yellow-500`
                                               `--paper-spinner-layer-4-color` | Color of the fourth spinner rotation | `--google-green-500`
                                               `--paper-spinner-stroke-width` | The width of the spinner stroke | 3px
                                               
                                               @group Paper Elements
                                               @element paper-spinner
                                               @hero hero.svg
                                               @demo demo/index.html
                                               */
Polymer({
  _template: template,
  is: 'paper-spinner',
  behaviors: [PaperSpinnerBehavior]
}); /// BareSpecifier=@polymer\paper-toast\paper-toast

var currentToast = null; /**
                         Material design: [Snackbars &
                         toasts](https://www.google.com/design/spec/components/snackbars-toasts.html)
                         
                         `paper-toast` provides a subtle notification toast. Only one `paper-toast` will
                         be visible on screen.
                         
                         Use `opened` to show the toast:
                         
                         Example:
                         
                             <paper-toast text="Hello world!" opened></paper-toast>
                         
                         Also `open()` or `show()` can be used to show the toast:
                         
                         Example:
                         
                             <paper-button on-click="openToast">Open Toast</paper-button>
                             <paper-toast id="toast" text="Hello world!"></paper-toast>
                         
                             ...
                         
                             openToast: function() {
                               this.$.toast.open();
                             }
                         
                         Set `duration` to 0, a negative number or Infinity to persist the toast on
                         screen:
                         
                         Example:
                         
                             <paper-toast text="Terms and conditions" opened duration="0">
                               <a href="#">Show more</a>
                             </paper-toast>
                         
                         
                         ### Styling
                         The following custom properties and mixins are available for styling:
                         
                         Custom property | Description | Default
                         ----------------|-------------|----------
                         `--paper-toast-background-color` | The paper-toast background-color | `#323232`
                         `--paper-toast-color` | The paper-toast color | `#f1f1f1`
                         
                         This element applies the mixin `--paper-font-common-base` but does not import
                         `paper-styles/typography.html`. In order to apply the `Roboto` font to this
                         element, make sure you've imported `paper-styles/typography.html`.
                         
                         @group Paper Elements
                         @element paper-toast
                         @demo demo/index.html
                         @hero hero.svg
                         */
Polymer({
  _template: html`
    <style>
      :host {
        display: block;
        position: fixed;
        background-color: var(--paper-toast-background-color, #323232);
        color: var(--paper-toast-color, #f1f1f1);
        min-height: 48px;
        min-width: 288px;
        padding: 16px 24px;
        box-sizing: border-box;
        box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.26);
        border-radius: 2px;
        margin: 12px;
        font-size: 14px;
        cursor: default;
        -webkit-transition: -webkit-transform 0.3s, opacity 0.3s;
        transition: transform 0.3s, opacity 0.3s;
        opacity: 0;
        -webkit-transform: translateY(100px);
        transform: translateY(100px);
        @apply --paper-font-common-base;
      }

      :host(.capsule) {
        border-radius: 24px;
      }

      :host(.fit-bottom) {
        width: 100%;
        min-width: 0;
        border-radius: 0;
        margin: 0;
      }

      :host(.paper-toast-open) {
        opacity: 1;
        -webkit-transform: translateY(0px);
        transform: translateY(0px);
      }
    </style>

    <span id="label">{{text}}</span>
    <slot></slot>
`,
  is: 'paper-toast',
  behaviors: [IronOverlayBehavior],
  properties: {
    /**
     * The element to fit `this` into.
     * Overridden from `Polymer.IronFitBehavior`.
     */fitInto: {
      type: Object,
      value: window,
      observer: '_onFitIntoChanged'
    },
    /**
     * The orientation against which to align the dropdown content
     * horizontally relative to `positionTarget`.
     * Overridden from `Polymer.IronFitBehavior`.
     */horizontalAlign: {
      type: String,
      value: 'left'
    },
    /**
     * The orientation against which to align the dropdown content
     * vertically relative to `positionTarget`.
     * Overridden from `Polymer.IronFitBehavior`.
     */verticalAlign: {
      type: String,
      value: 'bottom'
    },
    /**
     * The duration in milliseconds to show the toast.
     * Set to `0`, a negative number, or `Infinity`, to disable the
     * toast auto-closing.
     */duration: {
      type: Number,
      value: 3000
    },
    /**
     * The text to display in the toast.
     */text: {
      type: String,
      value: ''
    },
    /**
     * Overridden from `IronOverlayBehavior`.
     * Set to false to enable closing of the toast by clicking outside it.
     */noCancelOnOutsideClick: {
      type: Boolean,
      value: true
    },
    /**
     * Overridden from `IronOverlayBehavior`.
     * Set to true to disable auto-focusing the toast or child nodes with
     * the `autofocus` attribute` when the overlay is opened.
     */noAutoFocus: {
      type: Boolean,
      value: true
    }
  },
  listeners: {
    'transitionend': '__onTransitionEnd'
  },

  /**
   * Read-only. Deprecated. Use `opened` from `IronOverlayBehavior`.
   * @property visible
   * @deprecated
   */get visible() {
    Base._warn('`visible` is deprecated, use `opened` instead');

    return this.opened;
  },

  /**
   * Read-only. Can auto-close if duration is a positive finite number.
   * @property _canAutoClose
   */get _canAutoClose() {
    return this.duration > 0 && this.duration !== Infinity;
  },

  created: function () {
    this._autoClose = null;
    IronA11yAnnouncer.requestAvailability();
  },
  /**
   * Show the toast. Without arguments, this is the same as `open()` from
   * `IronOverlayBehavior`.
   * @param {(Object|string)=} properties Properties to be set before opening the toast.
   * e.g. `toast.show('hello')` or `toast.show({text: 'hello', duration: 3000})`
   */show: function (properties) {
    if (typeof properties == 'string') {
      properties = {
        text: properties
      };
    }

    for (var property in properties) {
      if (property.indexOf('_') === 0) {
        Base._warn('The property "' + property + '" is private and was not set.');
      } else if (property in this) {
        this[property] = properties[property];
      } else {
        Base._warn('The property "' + property + '" is not valid.');
      }
    }

    this.open();
  },
  /**
   * Hide the toast. Same as `close()` from `IronOverlayBehavior`.
   */hide: function () {
    this.close();
  },
  /**
   * Called on transitions of the toast, indicating a finished animation
   * @private
   */__onTransitionEnd: function (e) {
    // there are different transitions that are happening when opening and
    // closing the toast. The last one so far is for `opacity`.
    // This marks the end of the transition, so we check for this to determine
    // if this is the correct event.
    if (e && e.target === this && e.propertyName === 'opacity') {
      if (this.opened) {
        this._finishRenderOpened();
      } else {
        this._finishRenderClosed();
      }
    }
  },
  /**
   * Overridden from `IronOverlayBehavior`.
   * Called when the value of `opened` changes.
   */_openedChanged: function () {
    if (this._autoClose !== null) {
      this.cancelAsync(this._autoClose);
      this._autoClose = null;
    }

    if (this.opened) {
      if (currentToast && currentToast !== this) {
        currentToast.close();
      }

      currentToast = this;
      this.fire('iron-announce', {
        text: this.text
      });

      if (this._canAutoClose) {
        this._autoClose = this.async(this.close, this.duration);
      }
    } else if (currentToast === this) {
      currentToast = null;
    }

    IronOverlayBehaviorImpl._openedChanged.apply(this, arguments);
  },
  /**
   * Overridden from `IronOverlayBehavior`.
   */_renderOpened: function () {
    this.classList.add('paper-toast-open');
  },
  /**
   * Overridden from `IronOverlayBehavior`.
   */_renderClosed: function () {
    this.classList.remove('paper-toast-open');
  },
  /**
   * @private
   */_onFitIntoChanged: function (fitInto) {
    this.positionTarget = fitInto;
  } /**
     * Fired when `paper-toast` is opened.
     *
     * @event 'iron-announce'
     * @param {{text: string}} detail Contains text that will be announced.
     */
}); //<link rel="import" href="bower_components/web-animations-js/web-animations-next.dev.html">

function loadScript(url, callback) {
  var script = document.createElement("script");

  if (script.readyState) {
    //IE
    script.onreadystatechange = function () {
      if (script.readyState == "loaded" || script.readyState == "complete") {
        script.onreadystatechange = null;
        callback();
      }
    };
  } else {
    //Others
    script.onload = function () {
      if (callback) {
        callback();
      }
    };
  }

  script.src = url;
  script.async = false;
  document.getElementsByTagName("head")[0].appendChild(script);
}

loadScript("./node_modules/web-animations-js/src/dev.js");
loadScript("./node_modules/web-animations-js/src/scope.js");
loadScript("./node_modules/web-animations-js/src/timing-utilities.js");
loadScript("./node_modules/web-animations-js/src/normalize-keyframes.js");
loadScript("./node_modules/web-animations-js/src/deprecation.js");
loadScript("./node_modules/web-animations-js/src/keyframe-interpolations.js");
loadScript("./node_modules/web-animations-js/src/property-interpolation.js");
loadScript("./node_modules/web-animations-js/src/keyframe-effect.js");
loadScript("./node_modules/web-animations-js/src/apply-preserving-inline-style.js");
loadScript("./node_modules/web-animations-js/src/element-animatable.js");
loadScript("./node_modules/web-animations-js/src/interpolation.js");
loadScript("./node_modules/web-animations-js/src/matrix-interpolation.js");
loadScript("./node_modules/web-animations-js/src/animation.js");
loadScript("./node_modules/web-animations-js/src/tick.js");
loadScript("./node_modules/web-animations-js/src/matrix-decomposition.js");
loadScript("./node_modules/web-animations-js/src/handler-utils.js");
loadScript("./node_modules/web-animations-js/src/shadow-handler.js");
loadScript("./node_modules/web-animations-js/src/number-handler.js");
loadScript("./node_modules/web-animations-js/src/visibility-handler.js");
loadScript("./node_modules/web-animations-js/src/color-handler.js");
loadScript("./node_modules/web-animations-js/src/dimension-handler.js");
loadScript("./node_modules/web-animations-js/src/box-handler.js");
loadScript("./node_modules/web-animations-js/src/transform-handler.js");
loadScript("./node_modules/web-animations-js/src/font-weight-handler.js");
loadScript("./node_modules/web-animations-js/src/position-handler.js");
loadScript("./node_modules/web-animations-js/src/shape-handler.js");
loadScript("./node_modules/web-animations-js/src/property-names.js");
loadScript("./node_modules/web-animations-js/src/web-animations-bonus-cancel-events.js");
loadScript("./node_modules/web-animations-js/src/web-animations-bonus-object-form-keyframes.js");
loadScript("./node_modules/web-animations-js/src/web-animations-next-animation.js");
loadScript("./node_modules/web-animations-js/src/timeline.js");
loadScript("./node_modules/web-animations-js/src/keyframe-effect-constructor.js");
loadScript("./node_modules/web-animations-js/src/effect-callback.js");
loadScript("./node_modules/web-animations-js/src/group-constructors.js");
export { ironRangeBehavior as $ironRangeBehavior, paperDialogBehavior as $paperDialogBehavior, paperSpinnerBehavior as $paperSpinnerBehavior, IronRangeBehavior, PaperDialogBehaviorImpl, PaperDialogBehavior, PaperSpinnerBehavior };