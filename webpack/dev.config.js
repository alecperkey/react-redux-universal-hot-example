// Webpack config for development
var fs = require( 'fs' )
var path = require( 'path' )
var webpack = require( 'webpack' )
var WebpackIsomorphicTools = require( 'webpack-isomorphic-tools' )
var HappyPack = require( 'happypack' )


var assetsPath = path.resolve( __dirname, '../static/dist' )
var host = process.env.HOST || 'localhost'
var port = parseInt( process.env.PORT ) + 1 || 3001

// https://github.com/halt-hammerzeit/webpack-isomorphic-tools
var WebpackIsomorphicToolsPlugin = require( 'webpack-isomorphic-tools/plugin' )
var webpackIsomorphicToolsPlugin = new WebpackIsomorphicToolsPlugin( require( './webpack-isomorphic-tools' ) )

var babelrc = fs.readFileSync( './.babelrc' )
var babelrcObject = {}

try {
  babelrcObject = JSON.parse( babelrc )
} catch ( err ) {
  console.error( '==>     ERROR: Error parsing .babelrc.' )
  console.error( err )
}

var babelrcObjectDevelopment = babelrcObject.env && babelrcObject.env.development || {}

// merge global and dev-only plugins
var combinedPlugins = babelrcObject.plugins || []
combinedPlugins = combinedPlugins.concat( babelrcObjectDevelopment.plugins )

var babelLoaderQuery = Object.assign({}, babelrcObjectDevelopment, babelrcObject, { plugins: combinedPlugins, cacheDirectory: true })
delete babelLoaderQuery.env

// Since we use .babelrc for client and server, and we don't want HMR enabled on the server, we have to add
// the babel plugin react-transform-hmr manually here.

// make sure react-transform is enabled
babelLoaderQuery.plugins = babelLoaderQuery.plugins || []
var reactTransform = null
for (var i = 0; i < babelLoaderQuery.plugins.length; ++i ) {
  var plugin = babelLoaderQuery.plugins[ i ]
  if( Array.isArray( plugin ) && plugin[ 0 ] === 'react-transform' ) {
    reactTransform = plugin
  }
}

if( ! reactTransform ) {
  reactTransform = ['react-transform', { transforms: [] } ]
  babelLoaderQuery.plugins.push( reactTransform )
}

if( ! reactTransform[ 1 ] || ! reactTransform[ 1 ].transforms ) {
  reactTransform[ 1 ] = Object.assign( {}, reactTransform[ 1 ], { transforms: [] })
}

// make sure react-transform-hmr is enabled
reactTransform[ 1 ].transforms.push({
  transform: 'react-transform-hmr',
  imports  : [ 'react' ],
  locals   : [ 'module' ]
})

module.exports = {
  devtool: 'inline-eval-cheap-source-map',
  context: path.resolve(__dirname, '..'),
  module: {
    noParse: [
      /\.\/data\//, /\.\/nightwatch\//
    ],
    loaders: [
      {
        test   : /\.js$/,
        exclude: /node_modules/,
        loader : 'happypack/loader?id=babel'
      },
      { test: /\.json$/, loader: 'json-loader' },
      { test: /\.css$/,  loader: 'style!raw' },
      { test: /\.scss$/, loader: 'style!css?module&importLoaders=2&sourceMap&localIdentName=[local]___[hash:base64:5]!autoprefixer?browsers=last 2 version!sass?outputStyle=expanded&sourceMap&' },
      { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,   loader: "url?limit=10000&mimetype=application/font-woff" },
      { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,  loader: "url?limit=10000&mimetype=application/font-woff" },
      { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,    loader: "url?limit=10000&mimetype=application/octet-stream" },
      { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,    loader: "file" },
      { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,    loader: "url?limit=10000&mimetype=image/svg+xml" },
      { test: webpackIsomorphicToolsPlugin.regular_expression( 'images' ), loader: 'url-loader' }
    ]
  },
  progress: true,
  resolve: {
    modulesDirectories: [ 'node_modules' ],
    extensions        : [ '', '.json', '.js' ],
    alias             : {
      types      : path.resolve( __dirname, '..', 'src', 'types.js' ),
      permissions: path.resolve( __dirname, '..', 'src', 'permissions.js' ),
      common     : path.resolve( __dirname, '..', 'src', 'common', 'index.js' )
    }
  },
  plugins: [
    new webpack.optimize.OccurenceOrderPlugin( false ),

    new HappyPack({
      id: 'babel',
      cache: false,
      loaders: [{
        path : path.join( path.resolve( __dirname, '..' ), 'node_modules/babel-loader/index.js' ),
        query: '?' + JSON.stringify( babelLoaderQuery )
      }]
    }),
    new webpack.HotModuleReplacementPlugin(),
    // TODO: Keep an eye on removing this line, unknown side effects?
    //new webpack.IgnorePlugin(/\.json$/),
    new webpack.IgnorePlugin( /^\.\/locale$/, [ /moment$/ ] ),
    new webpack.DefinePlugin({
      __CLIENT__     : true,
      __SERVER__     : false,
      __DEVELOPMENT__: true,
      __DEVTOOLS__   : true  // <-------- DISABLE redux-devtools HERE
    })
  ]
};

if ( process.env.MAKE_DLL ) {
  module.exports.entry = {
    vendor   : vendorArray(),
    // App.dll.js is not used, but including it here is required for
    // webpack-assets to be written properly
    app      : [ './src/client.js' ],
    bootstrap: [ 'bootstrap-loader' ]
  }
  module.exports.output = {
    path         : assetsPath,
    filename     : '[name].dll.js',
    library      : '[name]_library',
    publicPath   : 'http://' + host + ':' + ( port - 1 ) + '/dist/'
    // pathinfo     : true,
  }
  module.exports.plugins.unshift(
    new webpack.DllPlugin({
      path: path.join( assetsPath, '[name]-manifest.json' ),
      name: '[name]_library',
    })
  )
  module.exports.plugins.push(
    webpackIsomorphicToolsPlugin.development()
  )
} else {
  module.exports.entry = {
    app: [
      'webpack-hot-middleware/client?path=http://' + host + ':' + port + '/__webpack_hmr',
      './src/client.js',
      'bootstrap-loader'
    ]
  }
  module.exports.output = {
    path         : assetsPath,
    filename     : 'app.js',
    publicPath   : 'http://' + host + ':' + port + '/dist/'
  }

  if ( ! process.env.CI ) {
    module.exports.plugins.unshift(

      new webpack.DllReferencePlugin({
        context : path.join( __dirname, '..' ),
        manifest: require('../static/dist/vendor-manifest.json')
      }),
      new webpack.DllReferencePlugin({
        context : path.join( __dirname, '..' ),
        manifest: require('../static/dist/bootstrap-manifest.json')
      })
    )
  }
}

function vendorArray() {
  return  [
    'babel',
    'babel-plugin-typecheck',
    'body-parser',
    'compression',
    'express',
    'express-session',
    'history',
    'file-loader',
    'hoist-non-react-statics',
    'http-proxy',
    'invariant',
    'less',
    'less-loader',
    'lru-memoize',
    'map-props',
    'multireducer',
    'piping',
    'pretty-error',
    'query-string',
    'react',
    'react-bootstrap',
    'react-document-meta',
    'react-dom',
    'react-inline-css',
    'react-redux',
    'react-router',
    'react-router-bootstrap',
    'redux',
    'redux-form',
    'redux-router',
    'scroll-behavior',
    'serialize-javascript',
    'serve-favicon',
    'socket.io',
    'socket.io-client',
    'superagent',
    'url-loader',
    'warning',
    'babel-runtime/core-js',
    'react-transform-catch-errors',
    'react-transform-hmr',
    'redbox-react',
    'redux-devtools',
    'redux-devtools-dock-monitor',
    'redux-devtools-log-monitor',
    'webpack-hot-middleware'
  ]
}