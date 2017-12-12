import AnimationsPlugin from './internal/slideshow-animations';
import TransitionerPlugin from './internal/slideshow-transitioner';

function plugin(UIkit) {

    if (plugin.installed) {
        return;
    }

    var {$, $$, addClass, assign, clamp, data, doc, endsWith, fastdom, getIndex, getPos, hasClass, includes, index, isNumber, isNumeric, isTouch, off, on, pointerDown, pointerMove, pointerUp, preventClick, Promise, removeClass, toggleClass, toNodes, trigger, win} = UIkit.util;

    var Animations = AnimationsPlugin(UIkit),
        Transitioner = TransitionerPlugin(UIkit);

    UIkit.mixin.slideshow = {

        attrs: true,

        props: {
            animation: String,
            autoplay: Boolean,
            autoplayInterval: Number,
            easing: String,
            index: Number,
            finite: Boolean,
            pauseOnHover: Boolean,
            velocity: Number
        },

        defaults: {
            animation: 'slide',
            autoplay: false,
            autoplayInterval: 7000,
            easing: 'ease',
            finite: false,
            pauseOnHover: true,
            velocity: 1,
            index: 0,
            stack: [],
            threshold: 10,
            percent: 0,
            clsActive: 'uk-active',
            clsActivated: 'uk-transition-active',
            easingOut: 'cubic-bezier(0.165, 0.840, 0.440, 1.000)',
            Animations,
            Transitioner,
            transitionOptions: {},
            preventCatch: false
        },

        computed: {

            list({selList}, $el) {
                return $(selList, $el);
            },

            slides() {
                return toNodes(this.list.children);
            },

            animation({animation, Animations}) {
                return assign(animation in Animations ? Animations[animation] : Animations.slide, {name: animation});
            },

            duration({velocity}, $el) {
                return speedUp($el.offsetWidth / velocity);
            },

            length() {
                return this.slides.length;
            },

            maxIndex() {
                return this.length - 1;
            },

            transitionOptions() {
                return {
                    animation: this.animation
                };
            },

        },

        init() {
            ['start', 'move', 'end'].forEach(key => {
                var fn = this[key];
                this[key] = e => {

                    var pos = getPos(e).x;

                    this.prevPos = pos !== this.pos ? this.pos : this.prevPos;
                    this.pos = pos;

                    fn(e);
                };
            });
        },

        connected() {
            this.startAutoplay();
        },

        disconnected() {
            this.stopAutoplay();
        },

        update: [

            {

                read() {
                    delete this._computeds.duration;
                },

                events: ['load', 'resize']

            }

        ],

        events: [

            {

                name: 'click',

                delegate() {
                    return `[${this.attrItem}],[data-${this.attrItem}]`;
                },

                handler(e) {
                    e.preventDefault();
                    e.current.blur();
                    this.show(data(e.current, this.attrItem));
                }

            },

            {

                name: pointerDown,

                delegate() {
                    return `${this.selList} > *`;
                },

                handler(e) {
                    if (isTouch(e) || !hasTextNodesOnly(e.target)) {
                        this.start(e);
                    }
                }

            },

            {

                name: 'visibilitychange',

                el: doc,

                handler() {
                    if (doc.hidden) {
                        this.stopAutoplay();
                    } else {
                        this.startAutoplay();
                    }
                }

            },

            {

                name: pointerDown,
                handler: 'stopAutoplay'

            },

            {

                name: 'mouseenter',

                filter() {
                    return this.autoplay;
                },

                handler() {
                    this.isHovering = true;
                }

            },

            {

                name: 'mouseleave',

                filter() {
                    return this.autoplay;
                },

                handler() {
                    this.isHovering = false;
                }

            },

            {

                name: 'beforeitemshow',

                self: true,

                delegate() {
                    return `${this.selList} > *`;
                },

                handler({target}) {
                    addClass(target, this.clsActive);
                }

            },

            {

                name: 'itemshown',

                self: true,

                delegate() {
                    return `${this.selList} > *`;
                },

                handler({target}) {
                    addClass(target, this.clsActivated);
                }

            },

            {

                name: 'itemshow itemhide itemhidden',

                self: true,

                delegate() {
                    return `${this.selList} > *`;
                },

                handler({type, target}) {
                    toggleClass($$(`[${this.attrItem}="${index(target)}"],[data-${this.attrItem}="${index(target)}"]`, this.$el), this.clsActive, endsWith(type, 'show'));
                }

            },

            {

                name: 'itemhidden',

                self: true,

                delegate() {
                    return `${this.selList} > *`;
                },

                handler({target}) {
                    removeClass(target, this.clsActive, this.clsActivated);
                }

            },

            {

                name: 'itemshow itemhide itemshown itemhidden',

                self: true,

                delegate() {
                    return `${this.selList} > *`;
                },

                handler({target}) {
                    UIkit.update(null, target);
                }

            },

            {
                name: 'dragstart',

                handler(e) {
                    e.preventDefault();
                }
            }

        ],

        methods: {

            start(e) {

                if (e.button > 0 || this.length < 2) {
                    return;
                }

                if (this.preventCatch) {
                    return;
                }

                this.drag = this.pos;

                if (this._transitioner) {

                    this.percent = this._transitioner.percent();
                    this.drag += this._transitioner.getDistance() * this.percent * this.dir;
                    this._transitioner.translate(this.percent);
                    this._transitioner.cancel();

                    this.dragging = true;

                    this.stack = [];

                } else {
                    this.prevIndex = this.index;
                }

                this.unbindMove = on(doc, pointerMove, this.move, {capture: true, passive: false});
                on(win, 'scroll', this.unbindMove);
                on(doc, pointerUp, this.end, true);

            },

            move(e) {

                var distance = this.pos - this.drag;

                if (distance === 0 || this.prevPos === this.pos || !this.dragging && Math.abs(distance) < this.threshold) {
                    return;
                }

                e.cancelable && e.preventDefault();

                this.dragging = true;
                this.dir = distance < 0 ? 1 : -1;

                var slides = this.slides,
                    prevIndex = this.prevIndex,
                    dis = Math.abs(distance),
                    nextIndex = this.getIndex(prevIndex + this.dir, prevIndex),
                    width = this._getDistance(prevIndex, nextIndex);

                while (nextIndex !== prevIndex && dis > width) {

                    this.drag -= width * this.dir;

                    prevIndex = nextIndex;
                    dis -= width;
                    nextIndex = this.getIndex(prevIndex + this.dir, prevIndex);
                    width = this._getDistance(prevIndex, nextIndex);

                }

                this.percent = dis / width;

                var prev = slides[prevIndex],
                    next = slides[nextIndex],
                    changed = this.index !== nextIndex,
                    edge = prevIndex === nextIndex;

                [this.index, this.prevIndex].filter(i => !includes([nextIndex, prevIndex], i)).forEach(i => {
                    trigger(slides[i], 'itemhidden', [this]);

                    this._transitioner && this._transitioner.reset();

                    if (edge) {
                        this.prevIndex = prevIndex;
                    }

                });

                if (this.index === prevIndex && this.prevIndex !== prevIndex) {
                    trigger(slides[this.index], 'itemshown', [this]);
                }

                if (changed) {
                    this.prevIndex = prevIndex;
                    this.index = nextIndex;

                    !edge && trigger(prev, 'beforeitemhide', [this]);
                    trigger(next, 'beforeitemshow', [this]);
                }

                this._transitioner = this._translate(Math.abs(this.percent), prev, !edge && next);

                if (changed) {
                    !edge && trigger(prev, 'itemhide', [this]);
                    trigger(next, 'itemshow', [this]);
                }

            },

            end() {

                off(win, 'scroll', this.unbindMove);
                this.unbindMove();
                off(doc, pointerUp, this.end, true);

                if (this.dragging) {

                    this.dragging = null;

                    if (this.index === this.prevIndex) {
                        this.percent = 1 - this.percent;
                        this.dir *= -1;
                        this._show(false, this.index, false, true);
                        this._transitioner = null;
                    } else {

                        var dirChange = this.dir < 0 === this.prevPos > this.pos;
                        this.index = dirChange ? this.index : this.prevIndex;

                        if (dirChange) {
                            this.percent = 1 - this.percent;
                        }

                        this.show(this.dir > 0 && !dirChange || this.dir < 0 && dirChange ? 'next' : 'previous', true);
                    }

                    preventClick();

                }

                this.drag
                    = this.percent
                    = null;

            },

            show(index, force = false) {

                if (this.dragging) {
                    return;
                }

                var stack = this.stack,
                    queueIndex = force ? 0 : stack.length,
                    reset = () => {
                        stack.splice(queueIndex, 1);

                        if (stack.length) {
                            this.show(stack.shift(), true);
                        }
                    };

                stack[force ? 'unshift' : 'push'](index);

                if (!force && stack.length > 1) {

                    if (stack.length === 2) {
                        this._transitioner.forward(200);
                    }

                    return;
                }

                var prevIndex = Math.min(this.index, this.maxIndex),
                    prev = hasClass(this.slides, this.clsActive) && this.slides[prevIndex],
                    nextIndex = this.getIndex(index, this.index),
                    next = this.slides[nextIndex];

                if (prev === next) {
                    reset();
                    return;
                }

                this.dir = getDirection(index, prevIndex);
                this.prevIndex = prevIndex;
                this.index = nextIndex;

                prev && trigger(prev, 'beforeitemhide', [this]);
                if (!trigger(next, 'beforeitemshow', [this, prev])) {
                    this.index = this.prevIndex;
                    reset();
                    return;
                }

                var promise = this._show(
                    prev,
                    next,
                    stack.length > 1,
                    force
                ).then(() => {

                    prev && trigger(prev, 'itemhidden', [this]);
                    trigger(next, 'itemshown', [this]);

                    return new Promise(resolve => {
                        fastdom.write(() => {
                            stack.shift();
                            if (stack.length) {
                                this.show(stack.shift(), true);
                            } else {
                                this._transitioner = null;
                            }
                            resolve();
                        });
                    });

                });

                prev && trigger(prev, 'itemhide', [this]);
                trigger(next, 'itemshow', [this]);

                prev && fastdom.flush(); // iOS 10+ will honor the video.play only if called from a gesture handler

                return promise;

            },

            getIndex(index = this.index, prev = this.index) {
                return clamp(getIndex(index, this.slides, prev, this.finite), 0, this.maxIndex);
            },

            outOfBounds(index, prev) {
                return this.finite && (isNumeric(index)
                    ? index < 0 || index > this.maxIndex
                    : prev === 0 && index === 'previous'
                        || prev === this.maxIndex && index === 'next'
                );
            },

            startAutoplay() {

                this.stopAutoplay();

                if (this.autoplay) {
                    this.interval = setInterval(() => {
                        if (!(this.isHovering && this.pauseOnHover) && !this.stack.length) {
                            this.show('next');
                        }
                    }, this.autoplayInterval);
                }

            },

            stopAutoplay() {
                if (this.interval) {
                    clearInterval(this.interval);
                }
            },

            _show(prev, next, forward, force) {

                this._transitioner = this._getTransitioner(
                    prev,
                    next,
                    this.dir,
                    assign({easing: force ? this.easingOut : this.easing}, this.transitionOptions)
                );

                if (!force && !prev) {
                    this._transitioner.translate(1);
                    return Promise.resolve();
                }

                return this._transitioner[forward ? 'forward' : 'show'](forward ? 150 : this.duration, this.percent);

            },

            _getDistance(prev, next) {
                return new this._getTransitioner(prev, prev !== next && next).getDistance();
            },

            _translate(percent, prev = this.prevIndex, next = this.index) {
                var transitioner = this._getTransitioner(prev !== next ? prev : false, next);
                transitioner.translate(percent);
                return transitioner;
            },

            _getTransitioner(prev, next, dir = this.dir || 1, options = this.transitionOptions) {
                return new this.Transitioner(
                    isNumber(prev) ? this.slides[prev] : prev,
                    isNumber(next) ? this.slides[next] : next,
                    dir,
                    options
                );
            }

        }

    };

    function getDirection(index, prevIndex) {
        return index === 'next'
            ? 1
            : index === 'previous'
                ? -1
                : index < prevIndex
                    ? -1
                    : 1;
    }

    function speedUp(x) {
        return .5 * x + 300; // parabola through (400,500; 600,600; 1800,1200)
    }

    function hasTextNodesOnly(el) {
        return !el.children.length && el.childNodes.length;
    }

}

export default plugin;
