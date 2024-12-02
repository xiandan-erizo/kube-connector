const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const { appOutDir, packager } = context;

    // 要删除的不必要文件扩展名
    const unnecessaryExtensions = [
        '.map',
        '.ts',
        '.tsx',
        '.md',
        '.flow',
        '.txt',
        '.LICENSE'
    ];

    // 要删除的文件夹
    const unnecessaryFolders = [
        'docs',
        'example',
        'examples',
        'test',
        'tests',
        '__tests__'
    ];

    function cleanDir(dirPath) {
        if (!fs.existsSync(dirPath)) return;

        const files = fs.readdirSync(dirPath);

        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                if (unnecessaryFolders.includes(file)) {
                    fs.rmSync(fullPath, { recursive: true });
                } else {
                    cleanDir(fullPath);
                }
            } else {
                const ext = path.extname(file);
                if (unnecessaryExtensions.includes(ext)) {
                    fs.unlinkSync(fullPath);
                }
            }
        }
    }

    // 清理 node_modules
    const nodeModulesPath = path.join(appOutDir, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        cleanDir(nodeModulesPath);
    }
};