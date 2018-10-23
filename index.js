/**
 * @author Stanislav Kalashnik <darkpark.main@gmail.com>
 * @license GNU GENERAL PUBLIC LICENSE Version 3
 */

'use strict';

var path     = require('path'),
    runner   = require('runner'),
    tools    = require('runner-tools'),
    logger   = require('runner-logger'),
    webpack  = require('webpack'),
    UglifyJS = require('uglifyjs-webpack-plugin'),
    css      = require('./css'),
    cwd      = process.cwd();


// public
// eslint-disable-next-line max-lines-per-function
module.exports = function ( config ) {
    var resolutions   = ['480', '576', '720', '1080'],
        source        = 'src',
        target        = path.join('build', config.vars.TARGET || (config.vars.PLATFORM || 'TARGET').toLowerCase()),
        platformName  = config.vars.PLATFORM ? config.vars.PLATFORM.toLowerCase() : config.vars.TARGET,
        webpackConfig = {
            mode: 'production',
            devtool: 'source-map',
            entry: path.resolve(path.join(source, 'js', 'main.js')),
            output: {
                filename: 'main.js',
                path: path.resolve(target)
            },
            resolve: {
                alias: {
                    'app:metrics': path.resolve(path.join(source, 'js', 'metrics.js')),
                    'app:config': path.resolve(path.join(source, 'js', 'config.js'))
                }
            },
            watchOptions: {
                // delay rebuilding after the first change (in ms)
                aggregateTimeout: 50
            },
            plugins: [
                // global constants
                new webpack.DefinePlugin(config.vars),
                new webpack.optimize.OccurrenceOrderPlugin()
            ]
        },
        replacePlugin = {
            tizen: new webpack.NormalModuleReplacementPlugin(
                /node_modules\/mag-app\/index.js/,
                path.join(process.cwd(), '/node_modules/tzn-app/index.js/')
            ),

            webos: new webpack.NormalModuleReplacementPlugin(
                /node_modules\/mag-app\/index.js/,
                path.join(process.cwd(), '/node_modules/webos-app/index.js/')
            ),

            smarttv: new webpack.NormalModuleReplacementPlugin(
                /node_modules\/mag-app\/index.js/,
                path.join(process.cwd(), '/node_modules/stv-app/index.js/')
            )
        };
    
    if ( replacePlugin[platformName] ) {
        webpackConfig.plugins.push(replacePlugin[platformName]);
    }

    // sanitize and prepare
    config.vars.DEVELOP = !!(config.vars.DEVELOP && config.vars.DEVELOP === 'true');
    config.vars.LIVERELOAD = {
        port: 35729
    };

    // escape string values
    Object.keys(config.vars).forEach(function ( name ) {
        if ( typeof config.vars[name] === 'string' ) {
            config.vars[name] = '"' + config.vars[name] + '"';
        }
    });

    if ( config.vars.DEVELOP ) {
        webpackConfig.mode = 'development';
    } else {
        webpackConfig.optimization = {
            minimize: true,
            minimizer: [
                new UglifyJS({
                    // set true to sourceMap to get correct map-file
                    sourceMap: true,
                    uglifyOptions: {
                        output: {
                            comments: false
                        },
                        /* eslint camelcase: 0 */
                        compress: {
                            // display warnings when dropping unreachable code or unused declarations etc.
                            warnings: false,
                            unused: true,
                            dead_code: true,
                            drop_console: true,
                            drop_debugger: true,
                            properties: false,
                            pure_funcs: [
                                'debug.assert',
                                'debug.log',
                                'debug.info',
                                'debug.warn',
                                'debug.fail',
                                'debug.inspect',
                                'debug.event',
                                'debug.stub',
                                'debug.time',
                                'debug.timeEnd'
                            ]
                        }
                    }
                })
            ]
        };
    }

    Object.assign(
        runner.tasks,

        // activate popup notifications on errors
        require('runner-generator-notify')(),

        require('runner-generator-repl')({
            runner: runner
        }),

        require('runner-generator-eslint')({
            watch: [
                path.join(source, 'js', '**', '*.js'),
                path.join('tasks', '**', '*.js')
            ]
        }),

        require('runner-generator-gettext')({
            // add languages to translate
            languages: ['de', 'el', 'es', 'fr', 'it', 'nl', 'pl', 'ru', 'et', 'lv', 'sl', 'uk', 'hy', 'ka', 'bg', 'tr', 'pt'],
            source: path.join(source, 'lang'),
            target: path.join(target, 'lang'),
            jsData: [path.join(source, 'js')]
        }),

        require('runner-generator-static')({
            open: path.join(target)
        }),

        require('runner-generator-livereload')({
            watch: [
                path.join(target, '**', '*'),
                '!' + path.join(target, '**', '*.map')
            ]
        }),

        require('runner-generator-webpack')(webpackConfig),

        require('runner-generator-npm')({
            target: target,
            onPublish: function ( done ) {
                var packagePath = path.join(cwd, 'package.json');

                // clear
                delete require.cache[packagePath];

                // merge data to a new package.json for publishing
                done(null, Object.assign({}, require(packagePath), config.package || {}));
            }
        })
    );

    if ( config.type === 'app' ) {
        Object.assign(
            runner.tasks,
            require('runner-generator-pug')({
                source: path.join(source, 'pug', 'main.pug'),
                target: path.join(target, 'index.html'),
                options: {
                    pretty: true
                },
                variables: Object.assign({}, config.vars, {package: require(path.join(cwd, 'package.json'))})
            })
        );

        resolutions.forEach(function ( resolution ) {
            Object.assign(
                runner.tasks,

                require('runner-generator-sass')({
                    file: path.join(source, 'sass', (config.vars.DEVELOP ? 'develop.' : 'release.') + resolution + '.scss'),
                    outFile: path.join(target, 'css', 'app.' + resolution + '.css'),
                    outputStyle: config.vars.DEVELOP ? 'nested' : 'compressed',
                    sourceMap: path.join(target, 'css', 'app.' + resolution + '.map')
                }, {
                    suffix: ':' + resolution
                }),

                css({
                    resolution: resolution,
                    outFile: path.join(target, 'css', 'sdk.' + resolution + '.css'),
                    mode: config.vars.DEVELOP ? 'develop' : 'release'
                }, {
                    suffix: ':' + resolution
                })
            );
        });
    }

    // main tasks
    runner.task('init', function ( done ) {
        var fs  = require('fs'),
            log = logger.wrap('init');

        tools.mkdir(
            [
                path.join(target, 'lang'),
                path.join(target, 'css')
            ],
            log,
            function () {
                fs.readFile('.npmignore', function ( error, data ) {
                    if ( error ) {
                        log.fail(error);
                        done(true);
                    } else {
                        tools.write([{name: path.join(target, '.npmignore'), data: data.toString()}], log, function () {
                            runner.run('gettext:prepare', done);
                        });
                    }
                });
            }
        );
    });

    runner.task('copy', function ( done ) {
        tools.copy(
            {
                source: path.join(source, 'img'),
                target: path.join(target, 'img')
            },
            logger.wrap('copy'),
            done
        );
    });

    runner.task('gettext:prepare', function ( done ) {
        var packagePath = path.join(cwd, 'package.json'),
            log         = logger.wrap('gettext'),
            jsData      = ['/* This file is autogenerated by gettext:prepare runner task. */', '/* eslint-disable */', ''],
            packageConfig;

        // clear
        delete require.cache[packagePath];

        packageConfig = require(packagePath).config || {};

        if ( packageConfig.name ) {
            jsData.push('gettext("' + packageConfig.name + '");');
        }
        if ( packageConfig.description ) {
            jsData.push('gettext("' + packageConfig.description + '");');
        }

        // to remove eslint warning
        jsData.push('');

        tools.write([{name: path.join(source, 'js', 'gettext.js'), data: jsData.join('\n')}], log, done);
    });

    runner.task('sass:build', runner.parallel('sass:build:480', 'sass:build:576', 'sass:build:720', 'sass:build:1080'));

    runner.task('css:build', runner.parallel('css:build:480', 'css:build:576', 'css:build:720', 'css:build:1080'));

    runner.task('build', runner.parallel(
        'pug:build', 'sass:build', 'css:build', 'webpack:build', 'copy',
        runner.serial('gettext:prepare', 'gettext:build')
    ));

    /* eslint-disable-next-line no-unused-vars */
    runner.task('watch', function ( done ) {
        runner.watch(path.join(source, 'pug', '**', '*.pug'), 'pug:build');
        runner.watch(path.join(source, 'sass', '**', '*.scss'), 'sass:build');
        runner.watch(path.join(source, 'img', '**', '*'), 'copy');
        runner.watch(path.resolve('package*json'), runner.parallel('css:build', 'gettext:prepare'));
        runner.run('eslint:watch');
        runner.run('webpack:watch');
    });

    runner.task('serve', runner.parallel('static:start', 'livereload:start', 'repl:start', 'notify:start'));

    runner.task('default', runner.serial('build', runner.parallel('watch', 'serve')));
};
