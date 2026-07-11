/**
 * 标注路由
 */

const express = require('express');
const controller = require('../controllers/annotationController');

const router = express.Router();

router.get('/', controller.getAnnotations);
router.get('/:id', controller.getAnnotationById);
router.post('/', controller.createAnnotation);
router.put('/:id', controller.updateAnnotation);
router.delete('/:id', controller.deleteAnnotation);

module.exports = router;
