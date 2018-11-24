(function () {
    var now;
    if (performance && performance.now) {
        now = function () {
            return performance.now();
        };
    } else {
        now = function () {
            return new Date().getTime();
        };
    }

    function getSetters(gl, prog, obj, pfx, depth) {
        if (!obj) return;
        depth = (depth + 1) || 0;
        if (depth > 10) {
            console.error('Nesting limit exceeded: ' + pfx);
            return;
        }

        pfx = pfx || '';

        function getSetter(gl, path, val) {

            let loc = gl.getUniformLocation(prog, path);

            if (!isNaN(val))
                return (function (gl, loc) {
                    return function (val) {
                        gl.uniform1f(loc, val);
                    }
                })(gl, loc);

            switch (val.length) {
                case 1:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform1f(loc, val[0]);
                        }
                    })(gl, loc);
                case 2:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform2f(loc, val[0], val[1]);
                        }
                    })(gl, loc);
                case 3:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform3f(loc, val[0], val[1], val[2]);
                        }
                    })(gl, loc);
                case 4:
                    return (function (gl, loc) {
                        return function (val) {
                            gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
                        }
                    })(gl, loc);

                    //gl.uniformMatrix[234]fv();
            }
        }

        let setters = {
            setters: {}
        };

        // horrific
        for (let k in obj) {
            if (!isNaN(obj[k])) {
                setters[k] = getSetter(gl, pfx + k, obj[k]);
            } else if (obj[k] instanceof Array) {
                if (!isNaN(obj[k][0])) {
                    setters[k] = getSetter(gl, pfx + k, obj[k]);
                } else {
                    setters.setters[k] = {
                        setters: {}
                    };
                    for (let i = 0; i < obj[k].length; i++)
                        setters.setters[k].setters[i] = getSetters(gl, prog, obj[k][i], pfx + k + '[' + i + ']' + '.', depth);
                }
            } else {
                setters.setters[k] = getSetters(gl, prog, obj[k], pfx + k + '.', depth);
            }
        }

        return setters;
    }

    window.not3 = function (canvas, options) {
        var gl,
            buffer,
            program,
            vertex_position,
            uniforms = options.uniforms,
            uniformSetters = {},
            start_time = now();

        if (!options.vertex)
            options.vertex = 'attribute vec3 position;\nvoid main() { gl_Position = vec4( position, 1.0 ); }';

        init();
        animate();

        function init() {
            try {
                gl = canvas.getContext("experimental-webgl");
            } catch (error) {}

            if (!gl) {
                throw "cannot create webgl context";
            }

            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0]),
                gl.STATIC_DRAW);

            program = createProgram(options.vertex, options.fragment);

            uniforms.time = 0;
            uniforms.resolution = [0, 0];
            uniformSetters = getSetters(gl, program, options.uniforms);

            console.log(uniformSetters);
        }

        function createProgram(vertex, fragment) {
            var prog = gl.createProgram();

            var vs = createShader(vertex, gl.VERTEX_SHADER);
            var fs = createShader(
                "#ifdef GL_ES\nprecision highp float;\n#endif\n\n" + fragment,
                gl.FRAGMENT_SHADER
            );

            if (!vs || !fs) return;

            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);

            gl.deleteShader(vs);
            gl.deleteShader(fs);

            gl.linkProgram(prog);

            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                console.warn("ERROR - Validate status: " + gl.getProgramParameter(prog, gl.VALIDATE_STATUS) +
                    '\n\n"' + gl.getError() + '"');
            }

            return prog;
        }

        function createShader(src, type) {
            var shader = gl.createShader(type);

            gl.shaderSource(shader, src);
            gl.compileShader(shader);

            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error((type == gl.VERTEX_SHADER ? "VERTEX" : "FRAGMENT") +
                    " SHADER:\n" +
                    gl.getShaderInfoLog(shader));

                return;
            }

            return shader;
        }

        function resizeCanvas() {
            if (
                canvas.width != canvas.clientWidth ||
                canvas.height != canvas.clientHeight
            ) {
                canvas.width = canvas.clientWidth;
                canvas.height = canvas.clientHeight;
                uniforms.resolution = [canvas.width, canvas.height];
                gl.viewport(0, 0, canvas.width, canvas.height);
            }
        }

        function animate() {
            resizeCanvas();
            _render();
            requestAnimationFrame(animate);
        }

        function _render() {
            if (!program) return;

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.useProgram(program);

            let delta = now() - uniforms.time;
            uniforms.time = 0.001 * (now() - start_time);
            if (options.update)
                options.update(uniforms, delta);

            setUniforms(uniforms, uniformSetters);

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(vertex_position, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(vertex_position);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.disableVertexAttribArray(vertex_position);
        }

        function setUniforms(obj, setters) {
            if (setters)
                for (let k in obj)
                    if (!setters[k])
                        setUniforms(obj[k], setters.setters[k]);
                    else if (setters[k] instanceof Function)
                setters[k](obj[k]);
        }
    }
})();