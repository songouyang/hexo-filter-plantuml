const http = require("http");
const https = require("https");
const childProcess = require('child_process');
const makeURL = require("./serverRender").makeURL;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const config = {
    //  Local and PlantUMLServer.
    render: "PlantUMLServer",

    // only works with PlantUMLServer
    server: "http://www.plantuml.com/plantuml",
    // create <img src='data:image/svg+xml;base64> or <img src="/xxx.svg"> or <img src="http://third/svg/xxx">
    // "inline","localLink","externalLink",
    inline: "inline",

    // only works with Local
    // where your dot binary
    GraphvizDotFile: "/usr/local/bin/dot",
    // where your jar
    PlantJar: "/usr/local/Cellar/plantuml/1.2019.10/libexec/plantuml.jar",

    // common options
    outputFormat: "svg", //svg/png

    //hidden option
    public_dir: "public",
    asset_path: "assert",
}

/**
 * generate a file path but not created.
 * @param base eg: base dir
 * @param extention eg: exe,svg
 * @returns {string}
 */
function genFullFilePath(base, extention) {
    const filename = crypto.randomBytes(4).readUInt32LE(0);
    var dir = path.join(base, "puml");
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    var s = path.join(dir, filename + "." + extention);
    console.log(path.resolve(s))
    return s;
}

/**
 *
 * @param standalone: true or false
 * @param tmpImgFile: full tmpImgFile path
 * @returns {string}
 */
function svg2img(standalone, tmpImgFile) {
    return new Promise((resolve, reject) => {
        if (!standalone) {
            // relevant path
            const dest = path.basename(tmpImgFile);
            resolve("<img src=\"" + path.join('/' + dest) + "\"/>");
        } else {
            const text = fs.readFileSync(tmpImgFile, 'utf8');
            fs.unlinkSync(svgFile);
            resolve("<img src='data:image/svg+xml;base64," + new Buffer(text.trim()).toString('base64') + "'>");
        }
    })
}


function localSideRendering(config, str) {
    var GraphvizDotFile = config.GraphvizDotFile;
    var PlantJar = config.PlantJar;
    if (!PlantJar || !GraphvizDotFile) {
        throw "Please fullfill GraphvizDotFile and PlantJar"
    }
    var outputFormat = config.outputFormat;
    const txtFile = genFullFilePath(require('os').tmpdir(), "txt");
    return new Promise((resolve, reject) => {
        fs.writeFile(txtFile, str, function (err) {
            if (err) {
                return console.log(err);
            }
            // run plantuml -help for more
            const args = [
                '-jar', PlantJar,
                // fixed x11 problems on CentOS
                '-Djava.awt.headless=true',
                '-t' + outputFormat, '-graphvizdot', GraphvizDotFile,
                txtFile
            ];
            childProcess.execFile("java", args, function (err, stdout, stderr) {
                if (err || stderr) {
                    console.log("err=");
                    console.log(stderr);
                    fs.unlinkSync(txtFile);
                    reject(err || stdout)
                } else {
                    const svgFile = genFullFilePath(config.base_dir, config.outputFormat);
                    fs.unlinkSync(txtFile);
                    svg2img(config.standalone, svgFile).then(function (img) {
                        fs.unlinkSync(svgFile);
                        resolve(img)
                    });
                }
            });
        });
    })
}

/**
 *
 * @param config
 * @param str
 * @param outputFormat
 * @returns {string|Promise<any>}
 */
function serverSideRendering(config, str) {
    var realUrl = makeURL(config.server, str, config.outputFormat);
    switch (config.inline) {
        case "inline":
            return new Promise((resolve, reject) => {
                (realUrl.startsWith("https") ? https : http).get(realUrl, response => {
                    var data = [];
                    response.on('data', function(chunk) {
                        data.push(chunk);
                    }).on('end', function() {
                        const buffer = Buffer.concat(data);
                        resolve("<img src='data:image/svg+xml;base64," + buffer.toString('base64') + "'>");
                    });
                });
            })
        case "localLink":
            const base = path.join(config.public_dir, config.asset_path);
            if (!fs.existsSync(base)){
                fs.mkdirSync(base);
            }
            return new Promise((resolve, reject) => {
                (realUrl.startsWith("https") ? https : http).get(realUrl, response => {
                    const svgFile = genFullFilePath(base, config.outputFormat);
                    var stream = response.pipe(fs.createWriteStream(svgFile));
                    stream.on("finish", function () {
                        const dest = path.dirname(svgFile, config.public_dir);
                        console.log(dest)
                        resolve("<img src=\"" + path.join('/' + dest) + "\"/>");
                    });
                });
            })
        case "externalLink":
            return '<img src="' + realUrl + '" />';
    }
}


module.exports = {
    config: config,
    serverSideRendering: serverSideRendering,
    localSideRendering: localSideRendering
}