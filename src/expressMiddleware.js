'use strict';

var _require = require('zipkin');
var Promise = require('bluebird'); // it's not been used in this 
var Annotation = _require.Annotation;
var Header = _require.HttpHeaders;
var _require$option = _require.option;
var Some = _require$option.Some;
var ZipkinNone = _require$option.None;
var TraceId = _require.TraceId;
var traceConfig = config.traceConfig; // how are we getting the config
var url = require('url');

function containsRequiredHeaders(req) {
  return ((req.header(Header.TraceId) !== undefined && req.header(Header.SpanId) !== undefined) || req.header('traceId') !== undefined && req.header('spanId') !== undefined);
}

function stringToBoolean(str) {
  return str === '1';
}

function stringToIntOption(str) {
  try {
    return new Some(parseInt(str));
  } catch (err) {
    return None;
  }
}

function formatRequestUrl(req) {
  var parsed = url.parse(req.originalUrl);
  return url.format({
    protocol: req.protocol,
    host: req.get('host'),
    pathname: parsed.pathname,
    search: parsed.search
  });
}

module.exports = function expressMiddleware(_ref) {
  var tracer = _ref.tracer;
  var _ref$serviceName = _ref.serviceName;
  var serviceName = _ref$serviceName === undefined ? 'unknown' : _ref$serviceName;
  var _ref$port = _ref.port;
  var port = _ref$port === undefined ? 0 : _ref$port;

  return function zipkinExpressMiddleware(req, res, next) {
      var newId = null;
      var strTraceId = req.header('traceId');
      var strSpanId  = req.header('spanId');
      var rootFlag  = req.header('rootFlag');
      if (rootFlag) {
        serviceName = traceConfig.resourceResolverName;
      } else {
        serviceName = traceConfig.applicationServerName;;
      }
      var spanId = tracer.createRootId();
      if (!(strTraceId && strSpanId)) {
          newId = new TraceId({
              traceId: new Some(spanId.spanId),
              spanId  : spanId.spanId
            });
          strTraceId = newId.traceId;
          strSpanId = newId.spanId;
        req['headers'].traceId = strTraceId;
        req['headers'].spanId = strSpanId;
        //req['headers'].rootFlag = rootFlag;
      }
    
      
      var id = tracer.id;
     
      
      
      if (strTraceId && strSpanId) {
        if(strTraceId === strSpanId) {
          newId = new TraceId({
                traceId: new Some(strTraceId),
                spanId  : strSpanId,
                parentId : ZipkinNone,
                debug: new Some(true)
              });
        } else {
          newId = new TraceId({
                traceId: new Some(strTraceId),
                parentId:new Some(strTraceId),
                spanId  : spanId.spanId,
                debug: new Some(true)
              });
        }
        
      } else {
        newId = new TraceId({
              traceId: new Some(spanId.spanId),
              spanId  : spanId.spanId,
              debug: new Some(true)
            });
        
      }
      res.set('X-TraceId', newId.traceId);
      var startTime = new Date();
      newId.timestamp = startTime.getTime();
      tracer.setId(newId);
      tracer.recordServiceName(serviceName);
      tracer.recordRpc(req.method);
      tracer.recordBinary('http.url', formatRequestUrl(req));
      tracer.recordAnnotation(new Annotation.LocalAddr({ port: port }));
      var serverRecv = new Annotation.ServerRecv();
      serverRecv.timestamp = newId.timestamp;
      tracer.recordAnnotation(serverRecv);

      req.traceId = newId.traceId;
      req.spanId =  newId.spanId;
      req.parentId = newId.parentId;

      res.on('finish', function (data) {
        var serverSend = new Annotation.ServerSend();
        var endTime = new Date();
        
        newId.timestamp = endTime.getTime();
        newId.duration = endTime.getTime() - startTime.getTime();
        tracer.setId(newId);
        tracer.recordServiceName(serviceName);
        //tracer.recordMessage('responseTime', newId.duration);
        tracer.recordBinary('http.status_code', res.statusCode.toString());
        tracer.recordAnnotation(new Annotation.LocalAddr({ port: port }));
        serverSend.timestamp = endTime.getTime();
        serverSend.duration = endTime.getTime() - startTime.getTime();
        tracer.recordAnnotation(serverSend);
      });
      
      next();
    
  };
};
