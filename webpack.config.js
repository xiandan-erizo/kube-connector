const path = require('path');

module.exports = {
    mode: 'production',
    target: 'electron-main',
    entry: './main.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'main.bundle.js'
    },
    optimization: {
        minimize: true,
        usedExports: true,
        sideEffects: true
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    externals: {
        electron: 'electron'
    }
};