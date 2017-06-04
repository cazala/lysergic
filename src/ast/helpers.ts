export function childrenRef(index: number) {
  return function (target, propertyKey: string | symbol) {
    if (delete target[propertyKey]) {
      target.nameMapping = target.nameMapping || {};

      target.nameMapping[index] = propertyKey;

      Object.defineProperty(target, propertyKey.toString(), {
        get: function () {
          return this.children[index] || null;
        },
        set: function (value) {
          this.children[index] = value || null;
          if (value) {
            value.parent = this;
            if (value.stop && value.stop.offset > this.stop.offset) {
              this.stop = value.stop;
            }
          }

        },
        enumerable: true
      });
    }
  };
}

export function indent(text: string): string {
  return text.replace(/^(.*)/gm, '  $1');
}
