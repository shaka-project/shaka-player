goog.require('shaka.log');
goog.require('shaka.util.Mp4Parser');

goog.provide('shaka.util.ISMVFragmentFilter');

function logBoxType(boxDataView) {
  var type = '';
  for (var i = 0; i < 4; i++) {
    var typeChar = uuidBoxView.getUint8(4 + i);
    type += String.fromCharCode(typeChar);
  }
}

var SINF_FIELD_BYTES = 32;
var ENCV_FIELD_BYTES = 78;
var ENCA_FIELD_BYTES = 28;

shaka.util.ISMVFragmentFilter = {
  processBuffer: function(mp4Buffer) {

    shaka.log.v1('processing mp4 buffer bytes as ismv:', mp4Buffer.byteLength);

    var Mp4Parser = shaka.util.Mp4Parser;

    var offset = 0;
    var sinfFieldBytes = SINF_FIELD_BYTES;
    var encvFieldBytes = ENCV_FIELD_BYTES;
    var encaFieldBytes = ENCA_FIELD_BYTES;

    new Mp4Parser()
        .box('moov', function(box) {
          offset += box.start;
          Mp4Parser.children(box);
        })
        .box('moof', function(box) {
          offset += box.start + 16;
          Mp4Parser.children(box);
        })
        .box('traf', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('encv', function(box) {
          box.reader.skip(encvFieldBytes);
          Mp4Parser.children(box);
        })
        .box('enca', function(box) {
          box.reader.skip(encaFieldBytes);
          Mp4Parser.children(box);
        })
        .box('sinf', function(box) {
          box.reader.skip(sinfFieldBytes);
          offset += sinfFieldBytes;
          Mp4Parser.children(box);
        })
        .box('schi', function(box) {
          Mp4Parser.children(box);
        })
        .fullBox('tenc', function() {})
        .fullBox('uuid', function(box) {
          shaka.log.v2('found uuid', box.start, box);

          var uuidBoxView = new DataView(mp4Buffer, box.start + offset, box.size);

          var size = uuidBoxView.getUint32(0);
          var type = uuidBoxView.getUint32(4);

          shaka.log.v2('size:', size);

          var freeType = ['s', 'k', 'i', 'p'];
          for (var i = 0; i < 4; i++) {
            var type = uuidBoxView.getUint8(4 + i);
            shaka.log.v2(freeType[i], freeType[i].charCodeAt());

            uuidBoxView.setUint8(4 + i, freeType[i].charCodeAt());
          }
        })
        .parse(mp4Buffer);
  }
};
