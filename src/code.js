
import acorn from 'acorn';
import astring from 'astring';


export function transformJS(code, option={}) {
    let result = {watchers: []};
    var ast = acorn.parse(code, { ecmaVersion: 6 })

    const funcTypes = {
        FunctionDeclaration: 1,
        FunctionExpression: 1,
        ArrowFunctionExpression: 1
    }

    const fix = (node) => {
        if(funcTypes[node.type] && node.body.body && node.body.body.length) {
            node.body.body.unshift({
                type: 'ExpressionStatement',
                expression: {
                    callee: {
                        type: 'Identifier',
                        name: '$$apply'
                    },
                    type: 'CallExpression'
                }
            });
        }
    }

    const transform = function(node) {
        const x = 0;
        for(let key in node) {
            let value = node[key];
            if(typeof value === 'object') {
                if(Array.isArray(value)) {
                    value.forEach(transform);
                } else if(value && value.type) {
                    transform(value);
                }
            }
        }
        fix(node);
    };
    
    transform(ast.body);


    function makeVariable(name) {
        return {
            "type": "VariableDeclaration",
            "declarations": [{
                "type": "VariableDeclarator",
                "id": {
                    "type": "Identifier",
                    "name": name
                },
                "init": null
            }],
            "kind": "var"
        }
    }

    function makeWatch(n) {
        function assertExpression(n) {
            if(n.type == 'Identifier') return;
            if(n.type.endsWith('Expression')) return;
            throw 'Wrong expression';
        };

        if(n.body.type != 'ExpressionStatement') throw 'Error';
        if(n.body.expression.type == 'AssignmentExpression') {
            const ex = n.body.expression;
            if(ex.operator != '=') throw 'Error';
            if(ex.left.type != 'Identifier') throw 'Error';
            const target = ex.left.name;
            if(!(target in rootVariables)) resultBody.push(makeVariable(target));

            assertExpression(ex.right);
            const exp = code.substring(ex.right.start, ex.right.end);
            result.watchers.push(`$cd.wa(() => (${exp}), ($value) => {${target}=$value;});`);
        } else if(n.body.expression.type == 'SequenceExpression') {
            const ex = n.body.expression.expressions;
            const handler = ex[ex.length - 1];
            if(['ArrowFunctionExpression', "FunctionExpression"].indexOf(handler.type) < 0) throw 'Error function';
            let callback = code.substring(handler.start, handler.end);

            if(ex.length == 2) {
                assertExpression(ex[0]);
                let exp = code.substring(ex[0].start, ex[0].end);
                result.watchers.push(`$watch($cd, () => (${exp}), ${callback});`);
            } else if(ex.length > 2) {
                for(let i = 0;i<ex.length-1;i++) assertExpression(ex[i]);
                let exp = code.substring(ex[0].start, ex[ex.length-2].end);
                result.watchers.push(`$cd.wa(() => [${exp}], ($args) => { (${callback}).apply(null, $args); });`);
            } else throw 'Error';
        } else throw 'Error';
    }

    let resultBody = [];
    let rootVariables = {};
    ast.body.forEach(n => {
        if(n.type !== 'VariableDeclaration') return;
        n.declarations.forEach(i => rootVariables[i.id.name] = true);
    });

    ast.body.forEach(n => {
        if(n.type == 'FunctionDeclaration' && n.id.name == 'onMount') result.$onMount = true;
        if(n.type == 'LabeledStatement' && n.label.name == '$') {
            try {
                makeWatch(n);
                return;
            } catch (e) {
                throw new Error(e + ': ' + code.substring(n.start, n.end));
            }
        }
        resultBody.push(n);
    });
    ast.body = resultBody;

    ast.body.push({
        type: 'ExpressionStatement',
        expression: {
            callee: {
                type: 'Identifier',
                name: '$$runtime'
            },
            type: 'CallExpression'
        }
    });
    
    ast.body = [{
        body: {
            type: 'BlockStatement',
            body: ast.body
        },
        id: {
            type: 'Identifier"',
            name: option.name
        },
        params: [{
            type: 'Identifier',
            name: '$element'
        }],
        type: 'FunctionDeclaration'
    }];
    
    result.code = astring.generate(ast);
    return result;
}
