/*
Copyright 2016 Just-BI BV, Roland Bouman (roland.bouman@just-bi.nl)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
(function(exports){
	//https://tools.ietf.org/html/rfc4180

	var error = $.import("error.xsjslib");

	function getChars(string){
		var n = string.length;
		var chars = [];
		for (var i = 0; i < n; i++){
			chars[i] = string.charCodeAt(i);
		}
		return chars;
	}

	function getJsStringCode(string){
		if (!string) {
			return "\"\""; // empty string
		}
		var chars = getChars(string); // array of char codes for string
		return "String.fromCharCode(" + chars.join(", ") + ")"; // back to string
	}

	function getRegexCode(string){
		var regexCode = [], hex;
		var chars = getChars(string); // array of char codes for string
		var i, n = chars.length;
		for (i = 0; i < n; i++){
			hex = chars[i].toString(16); // char code number to hex 
			switch (hex.length) {
				case 1:
					hex = "0" + hex;
					/* falls through */
				case 2:
					hex = "0" + hex;
					/* falls through */
				case 3:
					hex = "0" + hex;
					/* falls through */
			}
			hex = "\\u" + hex;
			regexCode.push(hex);
		}
		return regexCode.join("");
	}

	function getHeaderRow(resultset, parameters){
		var fieldsep = parameters.fieldsep;
		var rowsep = parameters.rowsep;
		var enclosedby = parameters.enclosedby;
		var escapedby = parameters.escapedby;

		var header = [];
		var metadata = resultset.getColumnMetadata();
		var i, c, name, n = metadata.length;
		for (i = 0; i < n; i++) {
			c = metadata[i];
			name = c.label || c.name;
			if (enclosedby) {
				name = name.replace("/" + getRegexCode(enclosedby) + "/g", escapedby + enclosedby);
				if (fieldsep) {
					name = name.replace("/" + getRegexCode(fieldsep) + "/g", escapedby + fieldsep);
				}
				if (rowsep) {
					name = name.replace(rowsep, escapedby + rowsep);
				}
				name = enclosedby + name + enclosedby;
			}
			header.push(name);
		}
		header = header.join(fieldsep);
		return header;
	}

	function createRowWriter(resultset, parameters){
		var rowWriter = [];

		rowWriter.push("var val, csv = [];");

		var rowsep = parameters.rowsep;
		rowWriter.push("var rowsep = " + getJsStringCode(rowsep) + ";");

		var fieldsep = parameters.fieldsep;
		rowWriter.push("var fieldsep = " + getJsStringCode(fieldsep) + ";");

		rowWriter.push("var nulls = " + getJsStringCode(parameters.nulls) + ";");

		var enclosedby = parameters.enclosedby;
		var reEnc = "";
		if (enclosedby) {
			reEnc += getRegexCode(enclosedby);
			if (rowsep) {
				reEnc += "|";
				reEnc += getRegexCode(rowsep);
			}

			if (fieldsep) {
				reEnc += "|";
				reEnc += getRegexCode(fieldsep);
			}
			reEnc = "/" + reEnc + "/";
			rowWriter.push("var enclosedby = " + getJsStringCode(parameters.enclosedby) + ";");
			rowWriter.push("var reEnc = " + reEnc + ";");

			var escapedby = parameters.escapedby || enclosedby;
			rowWriter.push("var escRepl = " + getJsStringCode(escapedby) + " + \"$&\";");

			rowWriter.push("var reEsc = /" + getRegexCode(enclosedby) + "/g;");
		}

		var metadata = resultset.getColumnMetadata();
		var i, c, n = metadata.length, columnType, columnName;
		var isArray, isDate;
		for (i = 0; i < n; i++){
			c = metadata[i];
			columnName = c.name;
			rowWriter.push("\nval = rowData[\"" + columnName + "\"];");
			if (c.isNullable !== false) {
				rowWriter.push("if (val === null){");
				rowWriter.push("  val = nulls;");
				rowWriter.push("} else {");
			}
			isArray = false;
			isDate = false;
			columnType = c.type;
			switch (columnType) {
				case 1:		//tinyint
				case 2: 	//smallint
				case 3: 	//integer
				case 4:		//bigint
				case 5: 	//decimal
				case 6: 	//real
				case 7: 	//double
				case 47: 	//smalldecimal
					break;
				case 12:	//binary
				case 13:	//varbinary
				case 27:	//blob
					rowWriter.push("v = \"binary data\"");
					break;
				case 14:	//date
				case 15:	//date
				case 16:	//timestamp
				case 17:	//seconddate
					isDate = true;
					/* falls through */
				case 51:	//text
				case 75:	//ST_POINT
					isArray = true;
					/* falls through */
				case 8: 	//char
				case 9:	 	//varchar
				case 10:	//nchar
				case 11:	//nvarchar
				case 25:	//clob
				case 26:	//nclob
				case 53:	//shorttext
				case 54:	//alphanum
					if (isDate) {
						rowWriter.push("val = val.toISOString();");
					}
					else
					if (isArray) {
						rowWriter.push("val = String.fromCharCode.apply(null, new Uint8Array(val));");
					}

					if (reEnc) {
						rowWriter.push("if (reEnc.test(val)){");
						rowWriter.push("  val = enclosedby + val.replace(reEsc, escRepl) + enclosedby;");
						rowWriter.push("}");
					}
					break;
				default:
					error.raise("Unexpected column type " + columnType);
			}
			if (c.isNullable !== false) {
				rowWriter.push("}");
			}
			rowWriter.push("csv.push(val);");
		}

		rowWriter.push("csv = csv.join(fieldsep);");
		rowWriter.push("return csv;");

		rowWriter = rowWriter.join("\n");
		//throw new Error(rowWriter);


    /* Turn off JSHint warnings for this statement as it is intended
       to be a form of eval in order to deal with generated code. */
    /* jshint ignore:start */
		rowWriter = new Function("rowIndex", "rowData", rowWriter);
    /* jshint ignore:end */

		return rowWriter;
	}

	function writeResultsetAsCsv(resultset, parameters) {
		var body = [];
		var rowWriter = createRowWriter(resultset, parameters);

		//write header row
		if (parameters.header !== "false"){
			body.push(getHeaderRow(resultset, parameters));
		}

		//write data rows
		resultset.iterate(function(rownum, row){
			body.push(rowWriter.call(null, rownum, row));
		});

		body = body.join(parameters.rowsep);
		return body;
	}

	exports.writeResultsetAsCsv = writeResultsetAsCsv;
	
	return exports;
}(this));
